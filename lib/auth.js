import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { createUserProfile } from './firestore';

/**
 * Регистрация нового пользователя.
 * Создаёт аккаунт в Firebase Auth и профиль в Firestore.
 */
export async function registerUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCredential.user;

    // Создаём профиль пользователя в Firestore
    await createUserProfile(user.uid, {
      email: user.email,
      createdAt: new Date().toISOString(),
      banks: [],
      settings: {
        notifications: true,
        theme: 'light',
      },
    });

    return { success: true, user };
  } catch (error) {
    console.error('Ошибка в registerUser:', error);
    return {
      success: false,
      error: getAuthErrorMessage(error.code) || error.message || 'Произошла ошибка при регистрации.',
    };
  }
}

/**
 * Авторизация существующего пользователя.
 */
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    return { success: true, user: userCredential.user };
  } catch (error) {
    return {
      success: false,
      error: getAuthErrorMessage(error.code),
    };
  }
}

/**
 * Выход из аккаунта.
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Не удалось выйти из аккаунта. Попробуйте ещё раз.',
    };
  }
}

/**
 * Преобразует коды ошибок Firebase Auth в понятные сообщения.
 */
function getAuthErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'Этот email уже зарегистрирован.',
    'auth/invalid-email': 'Некорректный формат email.',
    'auth/operation-not-allowed': 'Регистрация временно недоступна.',
    'auth/weak-password': 'Пароль слишком простой. Минимум 6 символов.',
    'auth/user-disabled': 'Аккаунт заблокирован.',
    'auth/user-not-found': 'Пользователь не найден.',
    'auth/wrong-password': 'Неверный пароль.',
    'auth/too-many-requests':
      'Слишком много попыток. Подождите немного.',
    'auth/invalid-credential': 'Неверный email или пароль.',
    'auth/network-request-failed':
      'Ошибка сети. Проверьте подключение.',
  };

  return messages[code] || 'Произошла ошибка. Попробуйте ещё раз.';
}
