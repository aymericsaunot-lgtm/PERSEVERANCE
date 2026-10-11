// Your settings. These values are safe to publish: the Firestore rules decide who can read
// or write, and the notification key below is the public half (the private half is a GitHub secret).
export const config = {
  appName: 'Perceverance',
  firebase: {
    apiKey: 'AIzaSyBbmaxUeNfJFNdLuHMAp5k7o6sTrNOmQf4',
    authDomain: 'perceverance-d76f6.firebaseapp.com',
    projectId: 'perceverance-d76f6',
    storageBucket: 'perceverance-d76f6.firebasestorage.app',
    messagingSenderId: '483225889863',
    appId: '1:483225889863:web:177e72f1b786d4987d9562',
  },
  push: {
    publicKey: 'BKlfcagJQoVBeLjMth5BKml8bqbP0UfDq0PnBU3iimBNAjNtaXXMC56n-g0e1wNfKbh7RoIEMysdlfGY3SjubCg',
  },
};
