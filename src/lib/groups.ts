import { getFirestore, collection, query, where, getDocs, addDoc, doc, updateDoc, increment, getDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { SharedDeckCard } from './community';

// --- Types ---

export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Timestamp;
  inviteCode: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  status: 'approved' | 'pending' | 'rejected';
  joinedAt: Timestamp;
}

export interface GroupDeck {
  id: string;
  groupId: string;
  title: string;
  description: string;
  cards: SharedDeckCard[];
  createdBy: string;
  authorName: string;
  visibility: 'group' | 'public';
  createdAt: Timestamp;
  downloads: number;
}

export interface GroupResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Firestore instance ---

let _fs: Firestore | null = null;

function getDb(): Firestore | null {
  try {
    if (!_fs) {
      const auth = getAuth();
      if (!auth.app) {
        console.warn('[groups] No Firebase app available — Firestore calls will fail');
        return null;
      }
      _fs = getFirestore(auth.app);
    }
    return _fs;
  } catch (err) {
    console.error('[groups] Failed to get Firestore instance:', err);
    return null;
  }
}

// --- Timeout helper (Firestore calls can hang indefinitely) ---

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// --- Invite code generation ---

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function findUniqueInviteCode(): Promise<string> {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  return generateInviteCode();
}

// --- Group CRUD ---

export async function createGroup(name: string, description: string): Promise<GroupResult<Group>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'You must be logged in to create a group' };

    const inviteCode = await findUniqueInviteCode();

    const groupRef = await withTimeout(
      addDoc(collection(db, 'groups'), {
        name,
        description: description || `${name} study group`,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        inviteCode,
      }),
      15000,
      'createGroup:addDoc(groups)',
    );

    // Create admin membership
    await withTimeout(
      addDoc(collection(db, 'group-members'), {
        groupId: groupRef.id,
        userId: user.uid,
        displayName: user.displayName || user.email || 'Anonymous',
        email: user.email || '',
        role: 'admin',
        status: 'approved',
        joinedAt: Timestamp.now(),
      }),
      15000,
      'createGroup:addDoc(group-members)',
    );

    const newGroup: Group = {
      id: groupRef.id,
      name,
      description: description || `${name} study group`,
      createdBy: user.uid,
      createdAt: Timestamp.now(),
      inviteCode,
    };

    return { success: true, data: newGroup };
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('timed out')) {
      return { success: false, error: 'Request timed out. Make sure Firestore is enabled in your Firebase Console (flashpoint-ccna) and you are logged in.' };
    }
    return { success: false, error: msg || 'Failed to create group' };
  }
}

export async function getGroup(groupId: string): Promise<GroupResult<Group>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const d = await withTimeout(getDoc(doc(db, 'groups', groupId)), 15000, 'getGroup');
    if (!d.exists()) return { success: false, error: 'Group not found' };

    return { success: true, data: { id: d.id, ...d.data() } as Group };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get group' };
  }
}

export async function getGroupByInviteCode(code: string): Promise<GroupResult<Group>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const q = query(collection(db, 'groups'), where('inviteCode', '==', code.toUpperCase()), limit(1));
    const snap = await withTimeout(getDocs(q), 15000, 'getGroupByInviteCode');
    if (snap.empty) return { success: false, error: 'Invalid invite code. Group not found.' };

    const d = snap.docs[0];
    return { success: true, data: { id: d.id, ...d.data() } as Group };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to look up invite code' };
  }
}

export async function listUserGroups(userId: string): Promise<GroupResult<(Group & { role: string; memberCount: number })[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    // Query by userId only (single-field, no composite index needed), filter status client-side
    const memberSnap = await withTimeout(getDocs(query(
      collection(db, 'group-members'),
      where('userId', '==', userId),
    )), 15000, 'listUserGroups:memberships');

    const approvedDocs = memberSnap.docs.filter(d => d.data().status === 'approved');
    const groupIds = [...new Set(approvedDocs.map(d => d.data().groupId))];
    const roleMap = new Map<string, string>();
    approvedDocs.forEach(d => {
      const data = d.data();
      if (!roleMap.has(data.groupId)) {
        roleMap.set(data.groupId, data.role);
      }
    });

    if (groupIds.length === 0) return { success: true, data: [] };

    // Fetch each group
    const groups: (Group & { role: string; memberCount: number })[] = [];
    for (const gid of groupIds) {
      const g = await withTimeout(getDoc(doc(db, 'groups', gid)), 10000, 'listUserGroups:getGroup');
      if (!g.exists()) continue;

      // Query by groupId only, filter approved client-side
      const allMemberDocs = await withTimeout(getDocs(query(
        collection(db, 'group-members'),
        where('groupId', '==', gid),
      )), 10000, 'listUserGroups:memberCount');
      const approvedCount = allMemberDocs.docs.filter(d => d.data().status === 'approved').length;

      groups.push({
        id: g.id,
        ...g.data(),
        role: roleMap.get(gid) || 'member',
        memberCount: approvedCount,
      } as Group & { role: string; memberCount: number });
    }

    return { success: true, data: groups };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list groups' };
  }
}

// --- Membership ---

export async function requestJoinGroup(groupId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'You must be logged in to join a group' };

    // Check if already a member or has pending request (query by groupId only, filter userId client-side)
    const allGroupMembers = await withTimeout(getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
    )), 15000, 'requestJoinGroup:checkExisting');
    const existing = allGroupMembers.docs.filter(d => d.data().userId === user.uid);

    if (existing.length > 0) {
      const status = existing[0].data().status;
      if (status === 'approved') return { success: false, error: 'You are already a member of this group' };
      if (status === 'pending') return { success: false, error: 'You already have a pending request' };
      if (status === 'rejected') {
        await withTimeout(updateDoc(doc(db, 'group-members', existing[0].id), {
          status: 'pending',
          joinedAt: Timestamp.now(),
        }), 15000, 'requestJoinGroup:reRequest');
      }
      return { success: true };
    }

    await withTimeout(addDoc(collection(db, 'group-members'), {
      groupId,
      userId: user.uid,
      displayName: user.displayName || user.email || 'Anonymous',
      email: user.email || '',
      role: 'member',
      status: 'pending',
      joinedAt: Timestamp.now(),
    }), 15000, 'requestJoinGroup:addDoc');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request joining group' };
  }
}

export async function approveMember(memberId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    await withTimeout(updateDoc(doc(db, 'group-members', memberId), { status: 'approved' }), 15000, 'approveMember');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve member' };
  }
}

export async function rejectMember(memberId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    await withTimeout(updateDoc(doc(db, 'group-members', memberId), { status: 'rejected' }), 15000, 'rejectMember');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reject member' };
  }
}

export async function removeMember(memberId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const { deleteDoc } = await import('firebase/firestore');
    const m = await withTimeout(getDoc(doc(db, 'group-members', memberId)), 10000, 'removeMember:getDoc');
    if (!m.exists()) return { success: false, error: 'Member not found' };

    const data = m.data();
    if (data.role === 'admin') return { success: false, error: 'Cannot remove the group admin' };

    await withTimeout(deleteDoc(doc(db, 'group-members', memberId)), 10000, 'removeMember:deleteDoc');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to remove member' };
  }
}

export async function listMembers(groupId: string): Promise<GroupResult<GroupMember[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await withTimeout(getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
    )), 15000, 'listMembers');

    const members: GroupMember[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupMember));
    members.sort((a, b) => {
      const ta = a.joinedAt?.toMillis?.() || 0;
      const tb = b.joinedAt?.toMillis?.() || 0;
      return tb - ta;
    });
    return { success: true, data: members };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list members' };
  }
}

export async function getPendingApprovals(groupId: string): Promise<GroupResult<GroupMember[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await withTimeout(getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
    )), 15000, 'getPendingApprovals');

    const members: GroupMember[] = snap.docs
      .filter(d => d.data().status === 'pending')
      .map(d => ({ id: d.id, ...d.data() } as GroupMember));
    members.sort((a, b) => {
      const ta = a.joinedAt?.toMillis?.() || 0;
      const tb = b.joinedAt?.toMillis?.() || 0;
      return ta - tb;
    });
    return { success: true, data: members };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get pending approvals' };
  }
}

// --- Group Decks ---

export async function uploadGroupDeck(
  groupId: string,
  title: string,
  description: string,
  cards: SharedDeckCard[],
  visibility: 'group' | 'public',
): Promise<GroupResult<string>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'You must be logged in' };

    const docRef = await withTimeout(addDoc(collection(db, 'group-decks'), {
      groupId,
      title,
      description: description || `${cards.length} cards`,
      cards,
      createdBy: user.uid,
      authorName: user.displayName || user.email || 'Anonymous',
      visibility,
      createdAt: Timestamp.now(),
      downloads: 0,
    }), 15000, 'uploadGroupDeck');

    return { success: true, data: docRef.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload deck' };
  }
}

export async function listGroupDecks(groupId: string): Promise<GroupResult<GroupDeck[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await withTimeout(getDocs(query(
      collection(db, 'group-decks'),
      where('groupId', '==', groupId),
    )), 15000, 'listGroupDecks');

    const decks: GroupDeck[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        groupId: data.groupId,
        title: data.title,
        description: data.description,
        cards: data.cards || [],
        createdBy: data.createdBy,
        authorName: data.authorName,
        visibility: data.visibility,
        createdAt: data.createdAt,
        downloads: data.downloads || 0,
      } as GroupDeck;
    });
    decks.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    return { success: true, data: decks };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list group decks' };
  }
}

export async function getGroupDeck(deckId: string): Promise<GroupResult<GroupDeck>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const d = await withTimeout(getDoc(doc(db, 'group-decks', deckId)), 15000, 'getGroupDeck');
    if (!d.exists()) return { success: false, error: 'Deck not found' };

    return { success: true, data: { id: d.id, ...d.data() } as GroupDeck };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get deck' };
  }
}

export async function deleteGroupDeck(deckId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const { deleteDoc } = await import('firebase/firestore');
    await withTimeout(deleteDoc(doc(db, 'group-decks', deckId)), 15000, 'deleteGroupDeck');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete deck' };
  }
}

export async function incrementGroupDeckDownload(id: string): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await withTimeout(updateDoc(doc(db, 'group-decks', id), { downloads: increment(1) }), 10000, 'incrementDownload');
  } catch {
    // non-critical
  }
}

export async function listPublicDecks(max = 50): Promise<GroupResult<GroupDeck[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await withTimeout(getDocs(query(
      collection(db, 'group-decks'),
      where('visibility', '==', 'public'),
    )), 15000, 'listPublicDecks');

    const decks: GroupDeck[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupDeck));
    decks.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    return { success: true, data: decks.slice(0, max) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list public decks' };
  }
}
