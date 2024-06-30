const admin = require('firebase-admin');

/**
 * The firebase services module has firebase related helper functions.
 * @module FirebaseServices
 */

/**
 * All the firebase apps in play stored by their name.
 * @type {Map<String, admin.app.App>}
 */
 const apps = new Map();
 module.exports.apps = apps;

/**
 * Will start an admin connection with the given name
 * @param {String} name - name of the connection
 * @param {JSON} adminSDK - the JSON file with admin config
 * @param {String} databaseURL - the database URL
 */
 function initializeFirebaseAdmin(name, adminSDK, databaseURL) {
    let app = admin.initializeApp({
        credential: admin.credential.cert(adminSDK),
        databaseURL: databaseURL,
    }, name);

    apps.set(name, app);
}

// require('firebase/firestore');
/**
 * The firebase utility module has some useful mongo related helper functions.
 * @module FirebaseUtil
 */

/** @type {Db} */
let _db;

module.exports = {
    apps,

    /**
     * Starts a connection to new firestore
     */
     async connect(appName) {
        if (appName) {
            const app = apps.get(appName);
            if (!app) {
                throw new Error(`No Firebase app initialized with the name ${appName}`);
            }
            _db = app.firestore();
        } else {
            _db = admin.firestore();
        }
        console.log('Connected to Firebase Firestore');
    },

    initializeFirebaseAdmin,

    /**
     * @returns {Db}
     */
    getDb() {
        if (!_db) {
            throw new Error('Firestore is not initialized. Call connect() first.');
        }
        return _db;
    },

    /**
     * @returns {Collection}
     */
    getBotGuildCol() {
        return _db.collection('botGuilds');
    },
    getExternalProjectsCol() {
        if (!_db) {
            throw new Error('Firestore is not initialized, call connect() first.')
        }
        return _db.collection('ExternalProjects');
    },
    getFactotumSubCol() {
        const externalProjectsCol = this.getExternalProjectsCol();
        if (!externalProjectsCol) {
            throw new Error('ExternalProjects collection is not initialized.')
        }
        return externalProjectsCol.doc('Factotum').collection('InitBotInfo');
    },

    /**
     * @param {String} appName
     * @returns {Firestore} Firestore instance for the given app
     */
     getFirestoreInstance(appName) {
        const app = apps.get(appName);
        if (!app) {
            throw new Error(`No Firebase app initialized with the name ${appName}`);
        }
        return app.firestore();
    },

    async mongooseConnect() {
        // this is no longer needed but keeping for now
        return Promise.resolve();
    }

};