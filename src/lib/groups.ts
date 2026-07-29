import { getFirestore, collection, query, where, orderBy, limit, getDocs, addDoc, doc, updateDoc, increment, getDoc, Timestamp, type Firestore } from 'firebase/firestore';
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

    const groupRef = await addDoc(collection(db, 'groups'), {
      name,
      description: description || `${name} study group`,
      createdBy: user.uid,
      createdAt: Timestamp.now(),
      inviteCode,
    });

    // Create admin membership
    await addDoc(collection(db, 'group-members'), {
      groupId: groupRef.id,
      userId: user.uid,
      displayName: user.displayName || user.email || 'Anonymous',
      email: user.email || '',
      role: 'admin',
      status: 'approved',
      joinedAt: Timestamp.now(),
    });

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
    return { success: false, error: err?.message || 'Failed to create group' };
  }
}

export async function getGroup(groupId: string): Promise<GroupResult<Group>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const d = await getDoc(doc(db, 'groups', groupId));
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
    const snap = await getDocs(q);
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

    // Find all approved memberships for this user
    const memberSnap = await getDocs(query(
      collection(db, 'group-members'),
      where('userId', '==', userId),
      where('status', '==', 'approved'),
    ));

    const groupIds = [...new Set(memberSnap.docs.map(d => d.data().groupId))];
    const roleMap = new Map<string, string>();
    memberSnap.docs.forEach(d => {
      const data = d.data();
      if (!roleMap.has(data.groupId)) {
        roleMap.set(data.groupId, data.role);
      }
    });

    if (groupIds.length === 0) return { success: true, data: [] };

    // Fetch each group
    const groups: (Group & { role: string; memberCount: number })[] = [];
    for (const gid of groupIds) {
      const g = await getDoc(doc(db, 'groups', gid));
      if (!g.exists()) continue;

      // Count approved members
      const memberCountSnap = await getDocs(query(
        collection(db, 'group-members'),
        where('groupId', '==', gid),
        where('status', '==', 'approved'),
      ));

      groups.push({
        id: g.id,
        ...g.data(),
        role: roleMap.get(gid) || 'member',
        memberCount: memberCountSnap.size,
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

    // Check if already a member or has pending request
    const existing = await getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
      where('userId', '==', user.uid),
      limit(1),
    ));

    if (!existing.empty) {
      const status = existing.docs[0].data().status;
      if (status === 'approved') return { success: false, error: 'You are already a member of this group' };
      if (status === 'pending') return { success: false, error: 'You already have a pending request' };
      // Rejected — allow re-request by updating
      await updateDoc(doc(db, 'group-members', existing.docs[0].id), {
        status: 'pending',
        joinedAt: Timestamp.now(),
      });
      return { success: true };
    }

    await addDoc(collection(db, 'group-members'), {
      groupId,
      userId: user.uid,
      displayName: user.displayName || user.email || 'Anonymous',
      email: user.email || '',
      role: 'member',
      status: 'pending',
      joinedAt: Timestamp.now(),
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request joining group' };
  }
}

export async function approveMember(memberId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    await updateDoc(doc(db, 'group-members', memberId), { status: 'approved' });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve member' };
  }
}

export async function rejectMember(memberId: string): Promise<GroupResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    await updateDoc(doc(db, 'group-members', memberId), { status: 'rejected' });
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
    const m = await getDoc(doc(db, 'group-members', memberId));
    if (!m.exists()) return { success: false, error: 'Member not found' };

    const data = m.data();
    if (data.role === 'admin') return { success: false, error: 'Cannot remove the group admin' };

    await deleteDoc(doc(db, 'group-members', memberId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to remove member' };
  }
}

export async function listMembers(groupId: string): Promise<GroupResult<GroupMember[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
      orderBy('joinedAt', 'desc'),
    ));

    const members: GroupMember[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupMember));
    return { success: true, data: members };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list members' };
  }
}

export async function getPendingApprovals(groupId: string): Promise<GroupResult<GroupMember[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await getDocs(query(
      collection(db, 'group-members'),
      where('groupId', '==', groupId),
      where('status', '==', 'pending'),
      orderBy('joinedAt', 'asc'),
    ));

    const members: GroupMember[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupMember));
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

    const docRef = await addDoc(collection(db, 'group-decks'), {
      groupId,
      title,
      description: description || `${cards.length} cards`,
      cards,
      createdBy: user.uid,
      authorName: user.displayName || user.email || 'Anonymous',
      visibility,
      createdAt: Timestamp.now(),
      downloads: 0,
    });

    return { success: true, data: docRef.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload deck' };
  }
}

export async function listGroupDecks(groupId: string): Promise<GroupResult<GroupDeck[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await getDocs(query(
      collection(db, 'group-decks'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
    ));

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

    return { success: true, data: decks };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list group decks' };
  }
}

export async function getGroupDeck(deckId: string): Promise<GroupResult<GroupDeck>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const d = await getDoc(doc(db, 'group-decks', deckId));
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
    await deleteDoc(doc(db, 'group-decks', deckId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete deck' };
  }
}

export async function incrementGroupDeckDownload(id: string): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await updateDoc(doc(db, 'group-decks', id), { downloads: increment(1) });
  } catch {
    // non-critical
  }
}

export async function listPublicDecks(max = 50): Promise<GroupResult<GroupDeck[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const snap = await getDocs(query(
      collection(db, 'group-decks'),
      where('visibility', '==', 'public'),
      orderBy('downloads', 'desc'),
      limit(max),
    ));

    const decks: GroupDeck[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupDeck));
    return { success: true, data: decks };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list public decks' };
  }
}
