require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionsBitField, ChannelType} = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const commands = [
    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename the channel.')
        .addStringOption(option => option.setName('new_name').setDescription('New name for the channel.').setRequired(true)),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
        ].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// 作成者を記録するためのマップ
const channelCreators = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('guildCreate', async (guild) => {
    console.log(`Guild available: ${guild.name}`);
    let joinToCreateChannel = guild.channels.cache.find(channel => channel.name === 'join to create');

    if (!joinToCreateChannel) {
        joinToCreateChannel = await guild.channels.create({
            name: 'join to create',
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionsBitField.Flags.Connect],
                },
            ],
        });
        console.log('Created "join to create" channel.');
    } else {
        console.log('"join to create" channel already exists.');
    }
})

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!oldState.channel && newState.channel) {
        const guild = newState.guild;
        const member = newState.member;

        // ユーザー名と同じ名前のチャンネルを探す
        let userChannel = guild.channels.cache.find(channel => channel.name === member.user.username);

        // チャンネルが存在しない場合、新しく作成
        if (!userChannel) {
            userChannel = await guild.channels.create({
                name: member.user.username,
                type: ChannelType.GuildVoice,
            });

            // チャンネルの作成者を記録
            channelCreators.set(userChannel.id, member.id);
        }

        // ユーザーを新しいチャンネルに移動
        await member.voice.setChannel(userChannel);
    }
    // ボイスチャンネルから全てのユーザーがいなくなった場合
    if (oldState.channel && !oldState.channel.members.size) {
        // チャンネルが記録されている場合
        if (channelCreators.has(oldState.channel.id)) {
            channelCreators.delete(oldState.channel.id);
            await oldState.channel.delete();
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'rename') {
        const newName = options.getString('new_name');
        const channelId = getChannelIdByMemberId(interaction.user.id);
        if (!channelId) {
            return interaction.reply('You do not have a channel to rename.');
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
            return interaction.reply('Channel not found.');
        }

        try {
            await channel.setName(newName);
            await interaction.reply(`Renamed the channel to ${newName}.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to rename the channel.');
        }
    }

    if (commandName === 'ping') {
        await interaction.reply('Pong!');
    }
});

function getChannelIdByMemberId(memberId) {
    for (const [channelId, id] of channelCreators.entries()) {
        if (id === memberId) {
            return channelId;
        }
    }
    return null;
}

client.login(token);