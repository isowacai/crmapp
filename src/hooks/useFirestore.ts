import { useState, useEffect } from 'react';
import {
  collection,
  query,
  getDocs,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  DocumentData,
  QueryCompositeFilterConstraint,
  QueryConstraint,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface UseFirestoreOptions {
  collectionName: string;
  // Extra constraints (e.g. where clauses). Memoize the array: a new array on every render refetches.
  queries?: QueryConstraint[];
  // An or()/and() filter. Like `queries`, keep the same object between renders (useMemo).
  filter?: QueryCompositeFilterConstraint;
  limit?: number;
  // Newest first by createdAt. Turn off for filtered queries that shouldn't need a composite index.
  orderByCreated?: boolean;
  // Skip fetching until true (e.g. until the signed-in user is known)
  enabled?: boolean;
}

const NO_QUERIES: QueryConstraint[] = [];

interface BaseDocument {
  id: string;
  createdAt: Timestamp;
}

export function useFirestore<T extends DocumentData>({ 
  collectionName,
  queries = NO_QUERIES,
  filter,
  limit,
  orderByCreated = true,
  enabled = true
}: UseFirestoreOptions) {
  const [data, setData] = useState<(T & BaseDocument)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!enabled) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const ordering = orderByCreated ? [orderBy('createdAt', 'desc')] : [];
        const baseQuery = filter
          ? query(collection(db, collectionName), filter, ...ordering)
          : query(collection(db, collectionName), ...ordering, ...queries);
        
        const querySnapshot = await getDocs(baseQuery);
        
        if (!mounted) return;

        // doc.id must come last so a stored `id` field can't mask the real document ID
        const documents = querySnapshot.docs
          .map(doc => ({
            ...doc.data(),
            id: doc.id
          })) as (T & BaseDocument)[];

        setData(limit ? documents.slice(0, limit) : documents);
      } catch (err) {
        console.error('Error fetching data:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('An error occurred'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [collectionName, limit, queries, filter, orderByCreated, enabled, version]);

  // Refetch, e.g. after a write made outside this hook
  const reload = () => setVersion(v => v + 1);

  // Pass `id` to use it as the document ID; otherwise Firestore generates one
  const add = async (data: Omit<T, keyof BaseDocument>, id?: string) => {
    try {
      const timestamp = Timestamp.now();
      const docData = {
        ...data,
        createdAt: timestamp
      };

      let docId: string;
      if (id) {
        const docRef = doc(db, collectionName, id);
        if ((await getDoc(docRef)).exists()) {
          throw new Error(`A document with ID ${id} already exists`);
        }
        await setDoc(docRef, docData);
        docId = id;
      } else {
        docId = (await addDoc(collection(db, collectionName), docData)).id;
      }

      const newDoc = {
        ...docData,
        id: docId
      } as T & BaseDocument;
      
      setData(prev => [newDoc, ...prev]);
      return newDoc;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error adding document');
      console.error('Error adding document:', error);
      throw error;
    }
  };

  const update = async (id: string, data: Partial<Omit<T, keyof BaseDocument>>) => {
    try {
      const docRef = doc(db, collectionName, id);
      const updateData = {
        ...data,
        updatedAt: Timestamp.now()
      };
      
      await updateDoc(docRef, updateData);
      
      setData(prev => prev.map(item => 
        item.id === id ? { ...item, ...updateData } : item
      ));
      
      return { id, ...updateData };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error updating document');
      console.error('Error updating document:', error);
      throw error;
    }
  };

  const remove = async (id: string) => {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
      setData(prev => prev.filter(item => item.id !== id));
      return id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error deleting document');
      console.error('Error deleting document:', error);
      throw error;
    }
  };

  return {
    data,
    loading,
    error,
    add,
    update,
    remove,
    reload
  };
}