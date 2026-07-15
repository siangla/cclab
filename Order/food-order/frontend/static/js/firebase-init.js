let firebaseApp = null;
let auth = null;
let storage = null;

async function initFirebase() {
  if (firebaseApp) return;
  const res = await fetch('/api/v1/config');
  const config = await res.json();
  firebaseApp = firebase.initializeApp(config);
  auth = firebase.auth();
  storage = firebase.storage();
}

async function loginWithGoogle() {
  await initFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  const result = await auth.signInWithPopup(provider);
  return result.user;
}

async function loginWithFacebook() {
  await initFirebase();
  const provider = new firebase.auth.FacebookAuthProvider();
  const result = await auth.signInWithPopup(provider);
  return result.user;
}

async function getIdToken() {
  await initFirebase();
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

async function logout() {
  await initFirebase();
  await auth.signOut();
  localStorage.removeItem('user');
  window.location.href = '/';
}

async function syncUser(idToken) {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const data = await res.json();
  localStorage.setItem('user', JSON.stringify(data.user));
  return data.user;
}

async function apiCall(method, path, body = null) {
  const token = await getIdToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/v1${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '請求失敗' }));
    throw new Error(err.detail || '請求失敗');
  }
  return res.json();
}

// 上傳圖片到 Firebase Storage，回傳下載 URL
async function uploadImage(file, storagePath) {
  await initFirebase();
  if (!file) throw new Error('請選擇檔案');
  if (file.size > 5 * 1024 * 1024) throw new Error('圖片大小不可超過 5MB');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('僅支援 JPG、PNG、WebP 格式');

  const ref = storage.ref(storagePath);
  await ref.put(file);
  return await ref.getDownloadURL();
}
