import { useState, useEffect } from 'react';
import {
  collection,
  query,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  DocumentData,
  QueryConstraint,
  Timestamp,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface UseFirestoreOptions {
  collectionName: string;
  queries?: QueryConstraint[];
  limit?: number;
}

interface BaseDocument {
  id: string;
  createdAt: Timestamp;
}

export function useFirestore<T extends DocumentData>({ 
  collectionName,
  queries = [],
  limit
}: UseFirestoreOptions) {
  const [data, setData] = useState<(T & BaseDocument)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Create base query with default ordering
        const baseQuery = query(
          collection(db, collectionName),
          orderBy('createdAt', 'desc'),
          ...queries
        );
        
        const querySnapshot = await getDocs(baseQuery);
        
        if (!mounted) return;

        const documents = querySnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
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
  }, [collectionName, limit, ...queries]);

  const add = async (data: Omit<T, keyof BaseDocument>) => {
    try {
      const timestamp = Timestamp.now();
      const docData = {
        ...data,
        createdAt: timestamp
      };

      const docRef = await addDoc(collection(db, collectionName), docData);
      
      const newDoc = {
        ...docData,
        id: docRef.id
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
    remove
  };
}