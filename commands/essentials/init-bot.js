const { Command, CommandoGuild } = require('discord.js-commando');
const { Message, TextChannel, Snowflake, Guild, ColorResolvable, Role, Permissions } = require('discord.js');
const { sendMsgToChannel, addRoleToMember, } = require('../../discord-services');
const BotGuild = require('../../db/mongo/BotGuild');
const winston = require('winston');
const Console = require('../../classes/UI/Console/console');
const { MessagePrompt, StringPrompt, NumberPrompt, SpecialPrompt, RolePrompt, ChannelPrompt } = require('advanced-discord.js-prompts');

/**
 * The InitBot command initializes the bot on the guild. It will prompt the user for information needed 
 * to set up the bot. It is only usable by server administrators. It can only be run once.
 * @category Commands
 * @subcategory Essentials
 * @extends Command
 */
class InitBot extends Command {
    constructor(client) {
        super(client, {
            name: 'init-bot',
            group: 'essentials',
            memberName: 'initialize the bot',
            description: 'Will start the bot given some information.',
            hidden: true,
            args: []
        });
    }

    /**
     * @param {Message} message
     */
    async run(message) {
        message.delete();

        // easy constants to use
        var channel = message.channel;
        const userId = message.author.id;
        /** @type {CommandoGuild} */
        const guild = message.guild;
        const everyoneRole = message.guild.roles.everyone;

        const botGuild = await BotGuild.findById(guild.id);

        // make sure the user had manage server permission
        if (!message.member.hasPermission('MANAGE_GUILD')) {
            message.reply('Only admins can use this command!').then(msg => msg.delete({ timeout: 5000 }));
        }

        if (botGuild?.isSetUpComplete) {
            sendMsgToChannel(channel, userId, 'This guild is already set up!!', 30);
            return;
        }

        let initialMsg = await sendMsgToChannel(channel, userId, `This is the Factotum Bot Initialization procedure.
            First, I will ask two short questions.
            Then, we will move over to another channel and continue the initialization process.
            PLEASE read every question carefully! All the questions will end with instructions on how to respond.
            This is only the initial setup. You will be able to change things in the future!`);

        await new Promise((resolve) => setTimeout(resolve, 15000));

        // grab the admin role
        const adminRole = await this.askOrCreate('admin', channel, userId, guild, '#008369');
        addRoleToMember(message.member, adminRole);

        // create the admin channel room
        let { adminConsoleChannel, adminLog } = await BotGuild.createAdminChannels(guild, adminRole, everyoneRole);
        await sendMsgToChannel(channel, userId, 'The admin channels have been created successfully! <#' + adminConsoleChannel.id + '>. Lets jump over there and continue yes?!', 10);

        initialMsg.delete();

        // transition to the admin console
        channel = adminConsoleChannel;
        await sendMsgToChannel(channel, userId, 'I am over here!!! Lets continue!');

        const adminConsole = new Console({
            title: 'Factotum Admin Console',
            description: 'In this console you will be able to edit bot information.',
            channel: adminConsoleChannel,
            guild: guild,
        });
        adminConsole.addField('Role Changes', 'You are free to change role colors and role names! However, stamp role numbers can NOT be changed. You can add permissions but don\'t remove any!');
        adminConsole.sendConsole();

        // ask the user to move our role up the list
        await sendMsgToChannel(channel, userId, `Before we move on, could you please move my role up the role list as high as possible, this will give me the ability to assign roles! 
            I will wait for 15 seconds but feel free to take as long as you need!
            You can learn more here: https://support.discord.com/hc/en-us/articles/214836687-Role-Management-101`, 30);
        await new Promise((resolve) => setTimeout(resolve, 15000));

        // grab the staff role
        const staffRole = await this.askOrCreate('staff', channel, userId, guild, '#00D166');
        adminConsole.addField('The staff role:', `<@&${staffRole.id}>`);

        // get the regular member, this role will have the general member permissions
        const memberRole = await this.askOrCreate('member', channel, userId, guild, '#006798');
        adminConsole.addField('The member role:', `<@&${memberRole.id}>`);

        // bot support channel prompt
        let botSupportChannel = await ChannelPrompt.single({ prompt: 'What channel can the bot use to contact users when DMs are not available?', channel, userId, cancelable: false });
        adminConsole.addField('Channel used to contact Users with DM issues', `<#${botSupportChannel.id}>`);

        botGuild.readyUp(this.client, {
            roleIDs: {
                adminRole: adminRole.id,
                staffRole: staffRole.id,
                everyoneRole: everyoneRole.id,
                memberRole: memberRole.id,
            },
            channelIDs: {
                adminLog: adminLog.id,
                adminConsole: adminConsoleChannel.id,
                botSupportChannel: botSupportChannel.id,
            }
        });

        // ask if verification will be used
        var isVerification;
        try {
            isVerification = await SpecialPrompt.boolean({ prompt: 'Will you be using the verification service?', channel, userId, cancelable: true });
        } catch (error) {
            winston.loggers.get(guild.id).warning(`Handled an error when setting up verification, and thus was not set up. Error was ${error.name}`, { event: 'InitBot Command', data: error });
            isVerification = false;
        }

        if (isVerification) {
            // ask for guest role
            var guestRole = await this.askOrCreate('guest', channel, userId, guild, '#969C9F');

            let infoMsg = await sendMsgToChannel(channel, userId, 'I need to know what types to verify when a user tries to verify. Please follow the instructions, it will let you add as many types as you wish.');

            let types = await this.getVerificationTypes(channel, userId, guestRole, memberRole);
            infoMsg.delete();
            await botGuild.setUpVerification(this.client, guestRole.id, types);

            sendMsgToChannel(channel, userId, 'The verification service has been set up correctly!', 8);
            let typeListString = types.map(typeInfo => `${typeInfo.type} -> <@&${typeInfo.roleId}>`).join(', ');
            adminConsole.addField('Verification Feature', `IS ENABLED!\n Guest Role: <@&${guestRole.id}>\nTypes: ${typeListString}`);
        } else {
            sendMsgToChannel(channel, userId, 'Verification service was not set due to Prompt cancellation.', 8);
            adminConsole.addField('Verification Feature', 'IS NOT ENABLED!');
        }

        // only do attendance if verification is on!
        if (isVerification) {
            var isAttendance;
            try {
                isAttendance = await SpecialPrompt.boolean({ prompt: 'Will you be using the attendance service?', channel, userId });
            } catch (error) {
                winston.loggers.get(guild.id).warning(`Handled an error when setting up verification, and thus was not set up. Error was ${error.name}`, { event: 'InitBot Command', data: error });
                isAttendance = false;
            }

            if (isAttendance) {
                const attendeeRole = await this.askOrCreate('attendee', channel, userId, guild, '#0099E1');
                await botGuild.setUpAttendance(this.client, attendeeRole.id);

                sendMsgToChannel(channel, userId, 'The attendance service has been set up correctly!', 8);
                adminConsole.addField('Attendance Feature', `IS ENABLED!\n Attendance Role: <@&${attendeeRole.id}>`);
            } else {
                sendMsgToChannel(channel, userId, 'Attendance was not set up!', 8);
                adminConsole.addField('Attendance Feature', 'IS NOT ENABLED!');
            }
        } else {
            sendMsgToChannel(channel, userId, 'Attendance was not set up!', 8);
            adminConsole.addField('Attendance Feature', 'IS NOT ENABLED!');
        }

        // ask if the announcements will be used
        try {
            if (await SpecialPrompt.boolean({ prompt: 'Have firebase announcements been set up code-side? If not say no, or the bot will fail!', channel, userId })) {
                let announcementChannel = await ChannelPrompt.single('What channel should announcements be sent to? If you don\'t have it, create it and come back, do not cancel.');
                await botGuild.setUpAnnouncements(this.client, announcementChannel.id);

                sendMsgToChannel(channel, userId, 'The announcements have been set up correctly!', 8);
                adminConsole.addField('Announcement Feature', `IS ENABLED!\n Announcements Channel: <#${announcementChannel.id}>`);
            } else {
                sendMsgToChannel(channel, userId, 'Announcements functionality was not set up.', 8);
                adminConsole.addField('Announcement Feature', 'IS NOT ENABLED!');
            }
        } catch (error) {
            sendMsgToChannel(channel, userId, 'Announcements functionality was not set up due to a Prompt cancellation.', 8);
            adminConsole.addField('Announcement Feature', 'IS NOT ENABLED!');
        }


        // ask if the stamps will be used
        var isStamps;
        try {
            isStamps = await SpecialPrompt.boolean({ prompt: 'Will you be using the stamp service?', channel, userId });
        } catch {
            isStamps = false;
        }
        if (isStamps) {
            var numberOfStamps = 0;
            try {
                numberOfStamps = await NumberPrompt.single({ prompt: 'How many stamps do you want?', channel, userId, cancelable: true });
            } catch (error) {/** Do nothing */ }

            await botGuild.setUpStamps(this.client, numberOfStamps);
            guild.setGroupEnabled('stamps', true);

            sendMsgToChannel(channel, userId, 'The stamp roles have been created, you can change their name and/or color, but their stamp number is final!', 8);
            adminConsole.addField('Stamps Feature', 'IS ENABLED!\n You can change the role\'s name and color, but their number is final. For example, stamps 3 is stamp 3 even if its name changes.');
        } else {
            sendMsgToChannel(channel, userId, 'The stamp functionality was not set up.', 8);
            adminConsole.addField('Stamps Feature', 'IS NOT ENABLED!');
        }


        // ask if the user will use the report functionality
        var isReport;
        try {
            isReport = await SpecialPrompt.boolean({ prompt: 'Will you be using the report functionality?', channel, userId });
        } catch {
            isReport = false;
        }
        if (isReport) {
            var incomingReportChannel;
            try {
                incomingReportChannel = await ChannelPrompt.single({ prompt: 'What channel should prompts be sent to? We recommend this channel be accessible to your staff.', channel, userId });
            } catch {/** Do nothing */ }

            // Send report to report channel or admin log if none given!
            let channelId = incomingReportChannel ? incomingReportChannel.id : adminLog.id;
            await botGuild.setUpReport(this.client, channelId);

            sendMsgToChannel(channel, userId, `The report command is available and reports will be sent to: <#${channelId}>`, 8);
            adminConsole.addField('Report Feature', `IS ENABLED!\n Reports are sent to <#${channelId}>`);
        } else {
            sendMsgToChannel(channel, userId, 'Report command is not enabled.', 8);
            adminConsole.addField('Report Feature', 'IS NOT ENABLED!');
        }


        // ask if the user wants to use the experimental !ask command
        var isAsk;
        try {
            isAsk = await SpecialPrompt.boolean({ prompt: 'Do you want to let users use the experimental !ask command?', channel, userId });
        } catch {
            isAsk = false;
        }
        if (isAsk) {
            botGuild.setUpAsk(this.client);
            sendMsgToChannel(channel, userId, 'The ask command is now available to the server users.', 8);
            adminConsole.addField('Experimental Ask Command', 'IS ENABLED!');
        } else {
            sendMsgToChannel(channel, userId, 'Ask command is not enabled.', 8);
            adminConsole.addField('Experimental Ask Command', 'IS NOT ENABLED!');
        }

        await botGuild.save();
        botGuild.setCommandStatus(this.client);

        sendMsgToChannel(channel, userId, 'The bot is set and ready to hack!', 8);
    }

    /**
     * @typedef TypeInfo
     * @property {String} type
     * @property {String} roleId
     */

    /**
     * Prompts the user for a verification type and if they want to add more. Will call itself if true 
     * for a recursive call.
     * @param {TextChannel} channel 
     * @param {String} userId 
     * @returns {Promise<TypeInfo[]>}
     * @async
     */
    async getVerificationTypes(channel, userId, guestRole, memberRole) {
        let {type, role} = await this.getValidVerificationTypes(channel, userId, guestRole, memberRole);

        if (await SpecialPrompt.boolean({ prompt: 'Would you like to add another verification option?', channel, userId })) {
            return (await this.getVerificationTypes(channel, userId, guestRole, memberRole)).concat([{
                type: type,
                roleId: role.id,
            }]);
        } else {
            return [{
                type: type,
                roleId: role.id,
            }];
        }
    }

    async getValidVerificationTypes(channel, userId, guestRole, memberRole) {
        let typeMsg = await MessagePrompt.prompt({
            prompt: `Please tell me the type and mention the role for a verification option. 
            For example: hacker @hacker . Make sure you add nothing more to the message!`, channel, userId
        });
        let type = typeMsg.content.replace(/<(@&?|#)[a-z0-9]*>/, ''); // clean out any snowflakes
        type = type.toLowerCase().trim();
        let role = typeMsg.mentions.roles.first();

        if (role.id === guestRole.id || role.id === memberRole.id) {
            sendMsgToChannel(channel, userId, 'Guest and member roles cannot be used for verification. ' +
                'Please try again.', 30);
            await this.getValidVerificationTypes(channel, userId, guestRole, memberRole);
        }
        return {type, role};
    }

    /**
     * Will ask the user if a role has been created, if so, then prompt it, else then create it.
     * @param {String} roleName - the role name
     * @param {TextChannel} channel - the text channel were to prompt
     * @param {Snowflake} userId - the user id to prompt to 
     * @param {Guild} guild - the current guild
     * @param {ColorResolvable} - the role color
     * @async
     * @returns {Promise<Role>}
     */
    async askOrCreate(roleName, channel, userId, guild, color) {
        try {
            let hasRole = await SpecialPrompt.boolean({ prompt: 'Have you created the ' + roleName + ' role? You can go ahead and create it if you wish, or let me do the hard work.', channel, userId });
            if (hasRole) {
                return await RolePrompt.single({ prompt: 'What is the ' + roleName + ' role?', channel, userId });
            } else {
                if (roleName === 'admin') {
                    return await guild.roles.create({
                        data: {
                            name: await StringPrompt.single({ prompt: 'What name would you like the ' + roleName + ' role to have?', channel, userId }),
                            color: color,
                            permissions: Permissions.FLAGS.ADMINISTRATOR,
                        }
                    });
                } else {
                    return await guild.roles.create({
                        data: {
                            name: await StringPrompt.single({ prompt: 'What name would you like the ' + roleName + ' role to have?', channel, userId }),
                            color: color,
                        }
                    });
                }
            }
        } catch (error) {
            sendMsgToChannel(channel, userId, 'You need to complete this prompt please try again!', 5);
            return await this.askOrCreate(roleName, channel, userId, guild, color);
        }
    }
}
module.exports = InitBot;
