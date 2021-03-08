const discordServices = require('../../discord-services');
const Discord = require('discord.js');
const {yesNoPrompt, rolePrompt} = require('../../classes/prompt');
const BotGuildModel = require('../../classes/bot-guild');
const Workshop = require('../../classes/activities/workshop');
const PermissionCommand = require('../../classes/permission-command');
const Activity = require('../../classes/activities/activity');

// Command export
module.exports = class InitWorkshop extends PermissionCommand {
    constructor(client) {
        super(client, {
            name: 'new-workshop',
            group: 'a_activity',
            memberName: 'initialize workshop functionality for activity',
            description: 'Will initialize the workshop functionality for the given workshop. General voice channel will be muted for all hackers.',
            guildOnly: true,
            args: [
                {
                    key: 'activityName',
                    prompt: 'the activity name, can use emojis!',
                    type: 'string',
                },
            ],
        },
        {
            channel: PermissionCommand.FLAGS.ADMIN_CONSOLE,
            channelMessage: 'This command can only be used in the admin console!',
            role: PermissionCommand.FLAGS.ADMIN_ROLE,
            roleMessage: 'You do not have permission for this command, only admins can use it!',
        });
    }

    /**
     * Required class by children, should contain the command code.
     * @param {BotGuildModel} botGuild
     * @param {Discord.Message} message - the message that has the command
     * @param {String} activityName - the activity for this activity command
     */
    async runCommand(botGuild, message, {activityName}) {


        // prompt user for roles that will be allowed to see this activity.
        let roleParticipants = await Activity.promptForRoleParticipants(message.channel, message.author.id, true);


        // prompt user for roles that will have access to the TA side of the workshop
        var TARoles = new Discord.Collection();
        try {
            TARoles = await rolePrompt({prompt: 'What roles will have access to the TA portion of this workshop?', channel: message.channel, userId: message.author.id});
        } catch (error) {
            // do nothing if canceled
        }


        let workshop = await new Workshop({activityName, guild: message.guild, roleParticipants, botGuild}, TARoles).init();

        workshop.sendConsoles(this.client);

        // report success of workshop creation
        discordServices.replyAndDelete(message, 'Activity named: ' + activityName + ' was created as a workshop!');
    }

};