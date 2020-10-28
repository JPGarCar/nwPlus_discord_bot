
const { Command } = require('discord.js-commando');
const firebaseServices = require('./firebase-services')


// Available Roles
var guestRole = '742896900419747961';
var hackerRole = '738519785028976741';
var attendeeRole = '742896999556448357';
var mentorRole = '747527454200955051';
var sponsorRole = '738519983981723748';
var staffRole = '738519363904077916';
var adminRole = '738491577596641311';
var everyoneRole = '738475671977722058';
module.exports.everyoneRole = everyoneRole;
module.exports.hackerRole = hackerRole;
module.exports.guestRole = guestRole;
module.exports.adminRole = adminRole;
module.exports.attendeeRole = attendeeRole;
module.exports.mentorRole = mentorRole;
module.exports.sponsorRole = sponsorRole;
module.exports.staffRole = staffRole;

// other project wide vars
var embedColor = '#0099ff'
module.exports.embedColor = embedColor;

// Common channels
var boothingWaitList = '748370272049954927';
var adminLogChannel = '743197503884755045';
module.exports.boothingWaitList = boothingWaitList;


// Checks if the memeber has a role, returns true if it does
async function checkForRole(member, role) {
    var hasRole = await member.roles.cache.get(role);
    if(hasRole != undefined) {
        return true;
    } else {
        return false;
    }
}
module.exports.checkForRole = checkForRole;

// Send a Direct meesage to a member
async function sendMessageToMember(member, message, isDelete = false) {
    var msg = await member.send(message);
    if (isDelete === true) {
        msg.delete({timeout: 5000})
    }
    return msg;
}
module.exports.sendMessageToMember = sendMessageToMember;

// Add a role to a member
function addRoleToMember(member, addRole) {
    member.roles.add(addRole);
}
module.exports.addRoleToMember = addRoleToMember;

// Remove a role to a member
function removeRolToMember(member, removeRole) {
    member.roles.remove(removeRole);
}
module.exports.removeRolToMember = removeRolToMember;

// Replaces one role for the other
function replaceRoleToMember(member, removeRole, addRole) {
    removeRolToMember(member, removeRole);
    addRoleToMember(member, addRole);
}
module.exports.replaceRoleToMember = replaceRoleToMember;

// Log a message on the log channel
function discordLog(guild, message) {
    guild.channels.cache.get(adminLogChannel).send(message);
}
module.exports.discordLog = discordLog;

// reply to message and delete 5 seconds later
async function replyAndDelete(message, reply) {
    var msg = await message.reply(reply);
    msg.delete({timeout: 5000});
}
module.exports.replyAndDelete = replyAndDelete;

function isAdminConsole(channel) {
    return channel.id === '748955441484005488';
}
module.exports.isAdminConsole = isAdminConsole;

// will add given number of voice channels to the given activity, the category object of the activity is necessary
async function addVoiceChannelsToActivity(activityName, number, category, channelManager) {
    // udpate db and get total number of channels
    var total = await firebaseServices.activityAddPrivates(activityName, number);

    // grab index where channel naming should start, in case there are already channels made
    var index = total - number;

    // create voice channels
    for (; index < total; index++) {
        channelManager.create(activityName + '-' + index, {type: 'voice', parent: category, permissionOverwrites : [
            {
                id: hackerRole,
                deny: ['VIEW_CHANNEL'],
            },
            {
                id: attendeeRole,
                deny: ['VIEW_CHANNEL'],
                allow: ['USE_VAD', 'SPEAK'],
            },
            {
                id: sponsorRole,
                deny: ['VIEW_CHANNEL'],
            },
            {
                id: mentorRole,
                allow: ['VIEW_CHANNEL', 'USE_VAD', 'SPEAK', 'MOVE_MEMBERS'],
            },
            {
                id: staffRole,
                allow: ['VIEW_CHANNEL', 'USE_VAD', 'SPEAK', 'MOVE_MEMBERS'],
            }
        ]
        }).catch(console.error);
    }

    return total;
}
module.exports.addVoiceChannelsToActivity = addVoiceChannelsToActivity;

// will remove given number of voice channels from the activity
// returns the final number of channels in the activity
async function removeVoiceChannelsToActivity(activityName, number, category){
    // udpate db and get total number of channels
    var total = await firebaseServices.activityRemovePrivates(activityName, number);

    // grab the final number of channels there should be, no less than 0
    var final = total - number;
    if (final < 0) {
        final = 0;
    }

    // grab index where channel naming should start, in case there are already channels made
    // we remove one because we are counting from 0
    // remove voice channels
    for (var index = total - 1; index >= final; index--) {
        var channelName = activityName + '-' + index;
        var channel = await category.children.find(channel => channel.name === channelName);
        channel.delete();
    }

    return final;
}
module.exports.removeVoiceChannelsToActivity = removeVoiceChannelsToActivity;