import {
  getFirestore,
  collection,
  query,
  limit,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  increment,
  getDoc,
  deleteDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export interface LibraryResourceMeta {
  id: string;
  title: string;
  subject: string;
  description: string;
  tags: string[];
  fileType: 'pdf' | 'docx' | 'txt' | 'text';
  originalFileName?: string;
  authorName: string;
  authorId: string;
  createdAt: Timestamp;
  views: number;
  importsCount: number;
  wordCount: number;
  estimatedReadTime: number;
}

export interface LibraryResource extends LibraryResourceMeta {
  content: string;
}

export interface LibraryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

let _fs: Firestore | null = null;

function getDb(): Firestore | null {
  try {
    if (!_fs) {
      const auth = getAuth();
      if (!auth.app) return null;
      _fs = getFirestore(auth.app);
    }
    return _fs;
  } catch {
    return null;
  }
}

/** List all public library resources */
export async function listLibraryResources(max = 60): Promise<LibraryResult<LibraryResourceMeta[]>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore is not initialized.' };

    const q = query(collection(db, 'library-resources'), limit(max));
    const snapshot = await withTimeout(getDocs(q), 15000, 'listLibraryResources');
    
    const items: LibraryResourceMeta[] = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'Untitled Document',
        subject: data.subject || 'General',
        description: data.description || '',
        tags: data.tags || [],
        fileType: data.fileType || 'txt',
        originalFileName: data.originalFileName || '',
        authorName: data.authorName || 'Anonymous',
        authorId: data.authorId || '',
        createdAt: data.createdAt || Timestamp.now(),
        views: data.views || 0,
        importsCount: data.importsCount || 0,
        wordCount: data.wordCount || 0,
        estimatedReadTime: data.estimatedReadTime || 1,
      };
    });

    // Client-side sort by views / newest
    items.sort((a, b) => (b.views || 0) - (a.views || 0));
    return { success: true, data: items };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch library resources' };
  }
}

/** Get full details (including content text) of a single resource */
export async function getLibraryResource(id: string): Promise<LibraryResult<LibraryResource>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore is not initialized.' };

    const docRef = doc(db, 'library-resources', id);
    const snap = await withTimeout(getDoc(docRef), 10000, 'getLibraryResource');
    
    if (!snap.exists()) return { success: false, error: 'Resource not found' };

    const data = snap.data();
    const resource: LibraryResource = {
      id: snap.id,
      title: data.title || 'Untitled Document',
      subject: data.subject || 'General',
      description: data.description || '',
      content: data.content || '',
      tags: data.tags || [],
      fileType: data.fileType || 'txt',
      originalFileName: data.originalFileName || '',
      authorName: data.authorName || 'Anonymous',
      authorId: data.authorId || '',
      createdAt: data.createdAt || Timestamp.now(),
      views: data.views || 0,
      importsCount: data.importsCount || 0,
      wordCount: data.wordCount || 0,
      estimatedReadTime: data.estimatedReadTime || 1,
    };

    return { success: true, data: resource };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load resource content' };
  }
}

/** Upload a new resource to the Public Study Library */
export async function uploadLibraryResource(params: {
  title: string;
  subject: string;
  description?: string;
  content: string;
  tags: string[];
  fileType: 'pdf' | 'docx' | 'txt' | 'text';
  originalFileName?: string;
}): Promise<LibraryResult<string>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore is not initialized.' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'You must be logged in to publish to the Library.' };

    const wordCount = params.content.trim() ? params.content.trim().split(/\s+/).length : 0;
    const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200));

    const docRef = await withTimeout(
      addDoc(collection(db, 'library-resources'), {
        title: params.title.trim() || 'Untitled Study Resource',
        subject: params.subject.trim() || 'General',
        description: params.description?.trim() || '',
        content: params.content,
        tags: params.tags || [],
        fileType: params.fileType,
        originalFileName: params.originalFileName || '',
        authorName: user.displayName || user.email?.split('@')[0] || 'Anonymous Scholar',
        authorId: user.uid,
        createdAt: Timestamp.now(),
        views: 1,
        importsCount: 0,
        wordCount,
        estimatedReadTime,
      }),
      15000,
      'uploadLibraryResource'
    );

    return { success: true, data: docRef.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload resource to Library' };
  }
}

/** Increment view count for a resource */
export async function incrementResourceViews(id: string): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await updateDoc(doc(db, 'library-resources', id), { views: increment(1) });
  } catch {
    // Non-critical background task
  }
}

/** Increment import count when a user copies it into their Study Material */
export async function incrementResourceImports(id: string): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await updateDoc(doc(db, 'library-resources', id), { importsCount: increment(1) });
  } catch {
    // Non-critical background task
  }
}

/** Delete a resource (Author only) */
export async function deleteLibraryResource(id: string): Promise<LibraryResult<void>> {
  try {
    const db = getDb();
    if (!db) return { success: false, error: 'Firestore is not initialized.' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'Not authenticated' };

    const docRef = doc(db, 'library-resources', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return { success: false, error: 'Resource not found' };

    if (snap.data()?.authorId !== user.uid) {
      return { success: false, error: 'You can only delete your own library resources' };
    }

    await deleteDoc(docRef);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete resource' };
  }
}
