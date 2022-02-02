const firebase = require('firebase/compat/app');
const dotenv = require('dotenv');
dotenv.config();
require('firebase/compat/auth');
require('firebase/compat/firestore');
const firebaseConfig = {
    apiKey: process.env.FIREBASE_APIKEY,
    authDomain: process.env.FIREBASE_AUTHDOMAIN,
    projectId: process.env.FIREBASE_PROJECTID,
    storageBucket: process.env.FIREBASE_STORAGEBUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGINGSENDERID,
    appId: process.env.FIREBASE_APPID,
    measurementId: process.env.FIREBASE_MEASUREMENTID
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const firebaseFirestore = firebaseApp.firestore();

module.exports = { firebaseFirestore };