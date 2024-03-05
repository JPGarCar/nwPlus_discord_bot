// const { Command } = require('discord.js-commando');
// const { deleteMessage, sendMessageToMember, } = require('../../discord-services');
// const { MessageEmbed, Message } = require('discord.js');
// const BotGuild = require('../../db/mongo/BotGuild');

// /**
//  * The report command allows users to report incidents from the server to the admins. Reports are made 
//  * via the bot's DMs and are 100% anonymous. 
//  * @category Commands
//  * @subcategory Hacker-Utility
//  * @extends Command
//  */
// class Report extends Command {
//     constructor(client) {
//         super(client, {
//             name: 'report',
//             group: 'hacker_utility',
//             memberName: 'report to admins',
//             description: 'Will send report format to user via DM for user to send back via DM. Admins will get the report!',
//             // not guild only!
//             args: [],
//         });
//     }

//     /**
//      * @param {Message} message
//      */
//     async run (message) {
//         let botGuild = await BotGuild.findById(message.guild.id);

//         deleteMessage(message);

//         if (!botGuild.report.isEnabled) {
//             sendMessageToMember(message.author, 'The report functionality is disabled for this guild.');
//             return;
//         }

//         const embed = new MessageEmbed()
//             .setColor(botGuild.colors.embedColor)
//             .setTitle('Thank you for taking the time to report users who are not following server or MLH rules. You help makes our community safer!')
//             .setDescription('Please use the format below, be as precise and accurate as possible. \n ' + 
//                             'Everything you say will be 100% anonymous. We have no way of reaching back to you so again, be as detailed as possible!\n' + 
//                             'Copy paste the format and send it to me in this channel!')
//             .addField('Format:', 'User(s) discord username(s) (including discord id number(s)):\n' + 
//                                     'Reason for report (one line):\n' + 
//                                     'Detailed Explanation:\n' + 
//                                     'Name of channel where the incident occurred (if possible):');

//         // send message to user with report format
//         var msgEmbed = await message.author.send(embed);

//         // await response
//         msgEmbed.channel.awaitMessages(m => true, {max: 1}).then(async msgs => {
//             var msg = msgs.first();

//             msgEmbed.delete();
//             message.author.send('Thank you for the report! Our admin team will look at it ASAP!');

//             // send the report content to the admin report channel!
//             var incomingReportChn = await message.guild.channels.resolve(botGuild.report.incomingReportChannelID);

//             const adminMsgEmbed = new MessageEmbed()
//                 .setColor(botGuild.colors.embedColor)
//                 .setTitle('There is a new report that needs your attention!')
//                 .setDescription(msg.content);

//             // send embed with text message to ping admin
//             incomingReportChn.send('<@&' + botGuild.roleIDs.adminRole + '> Incoming Report', {embed: adminMsgEmbed});
//         });
        
//     }
// }
// module.exports = Report;

const { Command } = require('@sapphire/framework');
// const { deleteMessage, sendMessageToMember, } = require('../../discord-services');
const { Message, MessageEmbed, Modal, MessageActionRow, MessageButton, TextInputComponent } = require('discord.js');
const BotGuild = require('../../db/mongo/BotGuild');
const BotGuildModel = require('../../classes/Bot/bot-guild');
const { discordLog } = require('../../discord-services');

/**
 * The report command allows users to report incidents from the server to the admins. Reports are made 
 * via the bot's DMs and are 100% anonymous. 
 * @category Commands
 * @subcategory Hacker-Utility
 * @extends Command
 */
class StartReport extends Command {
    constructor(context, options) {
        super(context, {
            ...options,
            description: 'Will send report format to user via DM for user to send back via DM. Admins will get the report!',
        });
    }

    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
        ),
        {
            idHints: '1214159059880517652'
        };
    }

    /**
     * @param {BotGuildModel} botGuild
     * @param {Message} message
     */
    async chatInputRun(interaction) {
        this.botGuild = await BotGuild.findById(interaction.guild.id);
        const guild = interaction.guild;
        // const userId = interaction.user.id;

        // const embed = new MessageEmbed()
        //     .setTitle(`See an issue you'd like to annoymously report at ${interaction.guild.name}? Let our organizers know!`);

        const embed = new MessageEmbed()
            .setTitle('Annoymously report users who are not following server or MLH rules. Help makes our community safer!')
            .setDescription('Please use the format below, be as precise and accurate as possible. \n ' + 
                            'Everything you say will be 100% anonymous. We have no way of reaching back to you so again, be as detailed as possible!\n' + 
                            'Copy paste the format and send it to me in this channel!')
            .addField('Format:', 'User(s) discord username(s) (including discord id number(s)):\n' + 
                                    'Reason for report (one line):\n' + 
                                    'Detailed Explanation:\n' + 
                                    'Name of channel where the incident occurred (if possible):');
        // modal timeout warning?
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('report')
                    .setLabel('Report an issue')
                    .setStyle('PRIMARY'),
            );
        interaction.reply({ content: 'Report started!', ephemeral: true });
        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

        const checkInCollector = msg.createMessageComponentCollector({ filter: i => !i.user.bot});

        checkInCollector.on('collect', async i => {
            const modal = new Modal()
                .setCustomId('reportModal')
                .setTitle('Report an issue')
                .addComponents([
                    new MessageActionRow().addComponents(
                        new TextInputComponent()
                            .setCustomId('issueMessage')
                            .setLabel('Reason for report:')
                            .setMinLength(3)
                            .setMaxLength(1000)
                            .setStyle(2)
                            .setPlaceholder('Type your issue here...')
                            .setRequired(true),
                    ),
                ]);
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 300000, filter: j => j.user.id === i.user.id })
                .catch(error => {
                });

            if (submitted) {
                const issueMessage = submitted.fields.getTextInputValue('issueMessage');
                
                try {
                    discordLog(interaction.guild, `<@&${interaction.guild.roleIDs.staffRole}> New annoymous report:\n\n ${issueMessage}`);
                } catch {
                    discordLog(interaction.guild, `New annoymous report:\n\n ${issueMessage}`);
                }
                submitted.reply({ content: 'Thank you for taking the time to report users who are not following server or MLH rules. You help makes our community safer!', ephemeral: true });
                return;
            }
        });
    }
}
module.exports = StartReport;