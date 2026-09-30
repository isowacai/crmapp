import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig } from '../../config/firebaseConfig.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const createTestUser = async () => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, 'test@example.com', 'password123');
    console.log('Test user created successfully:', userCredential.user.uid);
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('Test user already exists');
    } else {
      console.error('Error creating test user:', error);
    }
  } finally {
    await auth.signOut();
    process.exit(0);
  }
};

createTestUser();