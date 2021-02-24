const PermissionCommand = require('./permission-command');
const discordServices = require('../discord-services');
const Activity = require('./activity');
const { Message } = require('discord.js');
const BotGuildModel = require('./bot-guild');

/**
 * The ActivityCommand class is a special class used for activity commands. It extends
 * the PermissionCommand to support role and channel validation.
 * This command adds category voice and text channel searches, and validation.
 */
class ActivityCommand extends PermissionCommand {

    /**
     * Constructor for our Activity command, it needs the Command and PermissionCommand parameters.
     * @param {import('discord.js-commando').CommandoClientOptions} client - the client the command is for
     * @param {import('discord.js-commando').CommandInfo} info - the information for this commando command
     * No need for a PermissionInformation because the ActivityCommand always has the same permission!
     * @param {Activity} activity - the activity this command is for
     */
    constructor(client, info){
        super(client, info, 
            {
                role: PermissionCommand.FLAGS.STAFF_ROLE,
                roleMessage: 'You do not have permission for this command, only staff can use it!',
                channel: PermissionCommand.FLAGS.ADMIN_CONSOLE,
                channelMessage: 'This command can only be used in the admin console!',
            }
        );
    }

    /**
     * Asked by our parent PermissionCommand, will contain the code specific to activity commands.
     */
    runCommand(botGuild, message, args, fromPattern, result) {
        // we don't want this command to be available outside the activity console
        this.runActivityCommand(botGuild, message, null, args);
    }


    /**
     * The public method to be used to call the command, it will check that an activity is passed!
     * @param {Message} message - the message that has the command
     * @param {Activity} activity - the activity for this command
     * @async
     */
    async runActivityCommand(botGuild, message, activity, args) {
        if (activity === null) discordServices.replyAndDelete(message, 'This command cannot be called outside an activity console!');
        else {
            this.activityCommand(botGuild, message, activity, args);
        }
    }


    /**
     * Required class by children, should contain the command code.
     * @param {BotGuildModel} botGuild
     * @param {Message} message - the message that has the command
     * @param {Activity} activity - the activity for this activity command
     * @abstract
     * @async
     */
    async activityCommand(botGuild, message, activity, args, fromPattern, result) {
        throw new Error('You need to implement the activityCommand method!');
    }
}

module.exports = ActivityCommand;