import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  sendEmailVerification,
  User as FirebaseUser,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown User',
  role: 'customer' as UserRole,
  lastLogin: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
  createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
  active: true
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? convertFirebaseUser(firebaseUser) : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        throw new Error('Please verify your email address');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, displayName?: string, role: UserRole = 'customer') => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (displayName) {
        await firebaseUpdateProfile(userCredential.user, { displayName });
      }
      
      // Create user document in Firestore with role
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        displayName: displayName || email.split('@')[0],
        role,
        createdAt: new Date(),
        lastLogin: new Date(),
        active: true
      });
      
      await sendEmailVerification(userCredential.user);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error('Not authenticated');
    }

    try {
      // Re-authenticate user first
      await signInWithEmailAndPassword(auth, auth.currentUser.email!, currentPassword);
      await firebaseUpdatePassword(auth.currentUser, newPassword);
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  };

  const updateProfile = async (displayName: string) => {
    if (!auth.currentUser) {
      throw new Error('Not authenticated');
    }

    try {
      await firebaseUpdateProfile(auth.currentUser, { displayName });
      await setDoc(doc(db, 'users', auth.currentUser.uid), { displayName }, { merge: true });
      setUser(prev => prev ? { ...prev, displayName } : null);
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    try {
      await setDoc(doc(db, 'users', userId), { role }, { merge: true });
    } catch (error) {
      console.error('Update user role error:', error);
      throw error;
    }
  };

  const sendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('Not authenticated');
    }

    try {
      await sendEmailVerification(auth.currentUser);
    } catch (error) {
      console.error('Send verification email error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        sendVerificationEmail,
        updateProfile,
        updateUserRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}