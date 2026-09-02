/**
 * إعدادات بيئة الإنتاج — مركز أَصيد (واجهة المعلّم)
 * انسخ نفس قيم Firebase الموجودة في environment.ts هنا أيضًا،
 * واترك preview = false في الإنتاج.
 */
export const environment = {
  production: true,
  preview: false,
  firebase: {
    apiKey: 'ضع_API_KEY_هنا',
    authDomain: 'assid-center.firebaseapp.com',
    projectId: 'assid-center',
    storageBucket: 'assid-center.appspot.com',
    messagingSenderId: 'ضع_SENDER_ID_هنا',
    appId: 'ضع_APP_ID_هنا',
  },
};
