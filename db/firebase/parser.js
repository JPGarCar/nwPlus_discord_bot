const csv = require('csv-parser');
const fs = require('fs');
require('dotenv').config();
const firebaseUtil = require('./firebaseUtil');

/** 
 * The firebase parser module has scripts to parse csv data to upload to 
 * firebase for validation purposes.
 * @module FirebaseParser
 */


const adminSDK = JSON.parse(process.env.NWPLUSADMINSDK);
let app = firebaseUtil.initializeFirebaseAdmin('factotum', adminSDK, 'https://nwplus-bot.firebaseio.com');

// save second argument as type of members to add
let type = process.argv[2];
if (type == undefined) {
    throw new Error('no defined type!');
}

// third argument is guild id
let guildId = process.argv[3];
if (!guildId) throw new Error('The guild id was not defined as the third argument!');

// optional fourth argument; if "true", all their previous types will be overwritten by this new one
let overwrite = false;
if (process.argv[4] === 'true') {
    overwrite = true;
}

class Registration {
    constructor(email) {
        this.email = email;
        this.types = [];
    }
}

const results = [];
const all_regs = {};
fs.createReadStream('registrations.csv') // requires a registrations.csv file in root directory to run
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
        results.forEach((row) => { // grab email from each csv entry and save to all_regs
            const email = (row['What is your primary email that can we contact you with?'] || row['Email Address']).toLowerCase();

            const r = new Registration(email);
            all_regs[email] = r;
        });

        let db = firebaseUtil.apps.get('factotum').firestore();

        var all = db.collection('guilds').doc(guildId).collection('members').get().then(snapshot => {
            // get all ids and types of members already in collections and store in idMap
            let idMap = new Map();
            snapshot.docs.forEach(doc => idMap.set(doc.id, doc.get('types'))); // keys are doc ids, values are member types

            let iterable = Object.entries(all_regs);
            console.log(`found ${iterable.length} registrations total!!`);

            console.log(`found ${idMap.size} existing registrations, actually patching ${iterable.length - idMap.size} new registrations`);
            while (iterable.length > 0) {
                var batch = db.batch();

                for (let [key, value] of iterable.splice(0, 500)) {
                    key = key.toLowerCase();
                    var docRef = db.collection('guilds').doc(guildId).collection('members').doc(key);
                    if (idMap.has(key)) {
                        // if overwrite is on, replace the Registration's existing types with just the new type
                        if (overwrite) {
                            value.types = [{ isVerified: false, type: type }];
                        } else {
                            // else retrieve the Registration's existing types and push the new type
                            value.types = idMap.get(key);
                            if (!idMap.get(key).some(role => role.type === type)) {
                                value.types.push({ isVerified: false, type: type });
                            }
                        }
                    } else {
                        // if member is new, just push current type into types array
                        value.types.push({ isVerified: false, type: type });
                    }
                    batch.set(docRef, Object.assign({}, value));
                }

                batch.commit();
                console.log('batch write success');
            }
            console.log('done!');
        });

    });