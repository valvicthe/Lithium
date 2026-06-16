/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Settings } from "@api/Settings";
import { findStoreLazy } from "@webpack";
import { ChannelStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { settings } from "../index";
import { LoggedMessageJSON } from "../types";
import { findLastIndex, getGuildIdByChannel } from "./misc";

export * from "./cleanUp";
export * from "./misc";

// stolen from mlv2
// https://github.com/1Lighty/BetterDiscordPlugins/blob/master/Plugins/MessageLoggerV2/MessageLoggerV2.plugin.js#L2367
export const DISCORD_EPOCH = 14200704e5;

export function reAddDeletedMessages(messages: LoggedMessageJSON[], deletedMessages: LoggedMessageJSON[], channelStart: boolean, channelEnd: boolean) {
    if (!messages.length || !deletedMessages?.length) return;

    // Build timestamp arrays for range computation (preserving original boundary logic)
    const IDs: { id: string; time: number; }[] = [];
    const savedIDs: { id: string; time: number; message: LoggedMessageJSON; }[] = [];

    for (let i = 0; i < messages.length; i++) {
        const { id } = messages[i] || {};
        if (!id) continue;
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) continue;
        IDs.push({ id, time: (parsedId / 4194304) + DISCORD_EPOCH });
    }
    for (let i = 0; i < deletedMessages.length; i++) {
        const record = deletedMessages[i];
        if (!record || !record.id) continue;
        const parsedId = parseInt(record.id);
        if (isNaN(parsedId)) continue;
        savedIDs.push({ id: record.id, time: (parsedId / 4194304) + DISCORD_EPOCH, message: record });
    }

    if (!IDs.length) return;
    savedIDs.sort((a, b) => a.time - b.time);
    if (!savedIDs.length) return;
    const { time: lowestTime } = IDs[IDs.length - 1];
    const [{ time: highestTime }] = IDs;
    const lowestIDX = channelEnd ? 0 : savedIDs.findIndex(e => e.time > lowestTime);
    if (lowestIDX === -1) return;
    const highestIDX = channelStart ? savedIDs.length - 1 : findLastIndex(savedIDs, e => e.time < highestTime);
    if (highestIDX === -1) return;

    // Extract message objects from the range, dedupe with Set (O(1) vs O(n) findIndex)
    const existingIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
        const mid = messages[i]?.id;
        if (mid) existingIds.add(mid);
    }

    const toInsert: LoggedMessageJSON[] = [];
    for (let i = lowestIDX; i <= highestIDX; i++) {
        const entry = savedIDs[i];
        if (entry?.message && !existingIds.has(entry.id)) {
            toInsert.push(entry.message);
        }
    }
    if (!toInsert.length) return;

    // Build combined array sorted newest-first (fixes original splice-at-wrong-position bug)
    const combined = messages.concat(toInsert);
    combined.sort((a, b) => {
        const ta = a?.id ? (parseInt(a.id) / 4194304 + DISCORD_EPOCH) : 0;
        const tb = b?.id ? (parseInt(b.id) / 4194304 + DISCORD_EPOCH) : 0;
        return tb - ta;
    });

    // Assign back in-place
    messages.length = 0;
    for (let i = 0; i < combined.length; i++) {
        messages.push(combined[i]);
    }
}

interface ShouldIgnoreArguments {
    channelId?: string,
    authorId?: string,
    guildId?: string;
    flags?: number,
    bot?: boolean;
    ghostPinged?: boolean;
    isCachedByUs?: boolean;
    webhookId?: string;
}

const EPHEMERAL = 64;

const UserGuildSettingsStore = findStoreLazy("UserGuildSettingsStore");

/**
  * the function `shouldIgnore` evaluates whether a message should be ignored or kept, following a priority hierarchy: User > Channel > Server.
  * In this hierarchy, whitelisting takes priority; if any element (User, Channel, or Server) is whitelisted, the message is kept.
  * However, if a higher-priority element, like a User, is blacklisted, it will override the whitelisting status of a lower-priority element, such as a Server, causing the message to be ignored.
  * @param {ShouldIgnoreArguments} args - An object containing the message details.
  * @returns {boolean} - True if the message should be ignored, false if it should be kept.
*/
export function shouldIgnore({ channelId, authorId, guildId, flags, bot, ghostPinged, isCachedByUs, webhookId }: ShouldIgnoreArguments): boolean {
    const isEphemeral = ((flags ?? 0) & EPHEMERAL) === EPHEMERAL;
    if (isEphemeral) return true; // ignore

    if (channelId && guildId == null)
        guildId = getGuildIdByChannel(channelId);

    const myId = UserStore.getCurrentUser().id;
    const { ignoreUsers, ignoreChannels, ignoreGuilds } = Settings.plugins.MessageLogger;
    const { ignoreBots, ignoreSelf, ignoreWebhooks } = settings.store;

    if (ignoreSelf && authorId === myId)
        return true; // ignore
    if (settings.store.alwaysLogDirectMessages && ChannelStore.getChannel(channelId ?? "-1")?.isDM?.())
        return false; // keep

    const shouldLogCurrentChannel = settings.store.alwaysLogCurrentChannel && SelectedChannelStore.getChannelId() === channelId;

    const ids = [authorId, channelId, guildId];

    const whitelistedIds = settings.store.whitelistedIds.split(",");

    const isWhitelisted = settings.store.whitelistedIds.split(",").some(e => ids.includes(e));
    const isAuthorWhitelisted = whitelistedIds.includes(authorId!);
    const isChannelWhitelisted = whitelistedIds.includes(channelId!);
    const isGuildWhitelisted = whitelistedIds.includes(guildId!);

    const blacklistedIds = [
        ...settings.store.blacklistedIds.split(","),
        ...(ignoreUsers ?? []).split(","),
        ...(ignoreChannels ?? []).split(","),
        ...(ignoreGuilds ?? []).split(",")
    ];

    const isBlacklisted = blacklistedIds.some(e => ids.includes(e));
    const isAuthorBlacklisted = blacklistedIds.includes(authorId);
    const isChannelBlacklisted = blacklistedIds.includes(channelId);

    const shouldIgnoreMutedGuilds = settings.store.ignoreMutedGuilds;
    const shouldIgnoreMutedCategories = settings.store.ignoreMutedCategories;
    const shouldIgnoreMutedChannels = settings.store.ignoreMutedChannels;

    if ((ignoreBots && bot) && !isAuthorWhitelisted) return true; // ignore

    if ((ignoreWebhooks && webhookId) && !isAuthorWhitelisted) return true;

    if (ghostPinged) return false; // keep

    // author has highest priority
    if (isAuthorWhitelisted) return false; // keep
    if (isAuthorBlacklisted) return true; // ignore

    if (isChannelWhitelisted) return false; // keep
    if (isChannelBlacklisted) return true; // ignore

    if (shouldLogCurrentChannel) return false; // keep

    if (isWhitelisted) return false; // keep

    if (isCachedByUs && (!settings.store.cacheMessagesFromServers && guildId != null && !isGuildWhitelisted)) return true; // ignore

    if (isBlacklisted && (!isAuthorWhitelisted || !isChannelWhitelisted)) return true; // ignore

    if (guildId != null && shouldIgnoreMutedGuilds && UserGuildSettingsStore.isMuted(guildId)) return true; // ignore
    if (channelId != null && shouldIgnoreMutedCategories && UserGuildSettingsStore.isCategoryMuted(guildId, channelId)) return true; // ignore
    if (channelId != null && shouldIgnoreMutedChannels && UserGuildSettingsStore.isChannelMuted(guildId, channelId)) return true; // ignore

    return false; // keep;
}

export type ListType = "blacklistedIds" | "whitelistedIds";

export function addToXAndRemoveFromOpposite(list: ListType, id: string) {
    const oppositeListType = list === "blacklistedIds" ? "whitelistedIds" : "blacklistedIds";
    removeFromX(oppositeListType, id);

    addToX(list, id);
}

export function addToX(list: ListType, id: string) {
    const items = settings.store[list] ? settings.store[list].split(",") : [];

    if (!items.includes(id)) {
        items.push(id);
        settings.store[list] = items.join(",");
    }
}

export function removeFromX(list: ListType, id: string) {
    const items = settings.store[list] ? settings.store[list].split(",") : [];
    const index = items.indexOf(id);
    if (index !== -1) {
        items.splice(index, 1);
        settings.store[list] = items.join(",");
    }
}
