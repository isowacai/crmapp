import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC0Jr9IlurH1-AfStLVaDFMv81IJTh2Btw",
  authDomain: "crmboltapp.firebaseapp.com",
  projectId: "crmboltapp",
  storageBucket: "crmboltapp.firebasestorage.app",
  messagingSenderId: "596047524575",
  appId: "1:596047524575:web:6830f4b95a42c13523ef6a",
  measurementId: "G-FLW4MFYJGG"
};

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