/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelToolbarButton } from "@api/HeaderBar";
import { resetCacheLimits } from "@utils/cacheLimits";
import { TestcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import {
    ActiveJoinedThreadsStore,
    ApplicationCommandIndexStore,
    ApplicationStore,
    ApplicationStreamingStore,
    ApplicationStreamPreviewStore,
    DraftStore,
    EditMessageStore,
    EmojiStore,
    ExperimentStore,
    GuildMemberStore,
    GuildStore,
    InviteStore,
    MessageCache,
    MessageStore,
    NotificationSettingsStore,
    PendingReplyStore,
    PresenceStore,
    QuestStore,
    RelationshipStore,
    RunningGameStore,
    SoundboardStore,
    SpellCheckStore,
    SpotifyStore,
    StickersStore,
    TypingStore,
    UploadAttachmentStore,
    UserAffinitiesStore,
    UserGuildSettingsStore,
    UserProfileStore,
    UserStore,
    showToast,
    Toasts,
} from "@webpack/common";

function CacheIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true" {...props}>
            <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z" />
        </svg>
    );
}

function clearStoreCache(name: string, store: any, cleared: string[]): void {
    try {
        if (store.clearCache) {
            store.clearCache();
            cleared.push(name);
        } else if (store.clear) {
            store.clear();
            cleared.push(name);
        }
    } catch { }
}

function clearMapCache(name: string, store: any, mapKey: string, cleared: string[]): void {
    try {
        const map = store[mapKey];
        if (map instanceof Map) {
            map.clear();
            cleared.push(name);
        }
    } catch { }
}

function softReset(): string[] {
    const cleared: string[] = [];

    try {
        MessageStore.clearCache?.();
        cleared.push("Message store");
    } catch { }

    try {
        MessageCache.clearCache?.();
        cleared.push("Message cache");
    } catch { }

    try {
        const keys = Object.keys(MessageCache._channelMessages ?? {});
        for (const key of keys) {
            MessageCache._channelMessages[key]._array = [];
        }
        cleared.push("Channel messages");
    } catch { }

    clearStoreCache("Draft store", DraftStore, cleared);
    clearStoreCache("Edit message store", EditMessageStore, cleared);
    clearStoreCache("Pending reply store", PendingReplyStore, cleared);
    clearStoreCache("Typing store", TypingStore, cleared);

    clearStoreCache("Emoji store", EmojiStore, cleared);
    clearStoreCache("Stickers store", StickersStore, cleared);
    clearStoreCache("Application command index", ApplicationCommandIndexStore, cleared);
    clearStoreCache("Application store", ApplicationStore, cleared);
    clearStoreCache("User profile store", UserProfileStore, cleared);
    clearStoreCache("Invite store", InviteStore, cleared);
    clearStoreCache("Quest store", QuestStore, cleared);
    clearStoreCache("Experiment store", ExperimentStore, cleared);
    clearStoreCache("Soundboard store", SoundboardStore, cleared);
    clearStoreCache("Spellcheck store", SpellCheckStore, cleared);
    clearStoreCache("Running game store", RunningGameStore, cleared);
    clearStoreCache("Upload attachment store", UploadAttachmentStore, cleared);
    clearStoreCache("Active joined threads store", ActiveJoinedThreadsStore, cleared);
    clearStoreCache("Application streaming store", ApplicationStreamingStore, cleared);
    clearStoreCache("Application stream preview store", ApplicationStreamPreviewStore, cleared);

    clearStoreCache("User guild settings store", UserGuildSettingsStore, cleared);
    clearStoreCache("Notification settings store", NotificationSettingsStore, cleared);
    clearStoreCache("Spotify store", SpotifyStore, cleared);
    clearStoreCache("User affinities store", UserAffinitiesStore, cleared);
    clearStoreCache("User store", UserStore, cleared);
    clearStoreCache("Guild store", GuildStore, cleared);
    clearStoreCache("Guild member store", GuildMemberStore, cleared);
    clearStoreCache("Relationship store", RelationshipStore, cleared);

    clearMapCache("Presence store", PresenceStore, "_presences", cleared);

    if (typeof (window as any).gc === "function") {
        try {
            (window as any).gc();
            cleared.push("Garbage collection");
        } catch { }
    }

    try {
        resetCacheLimits();
        cleared.push("Cache limits");
    } catch { }

    return cleared;
}

function CacheResetButton() {
    const handleClick = () => {
        const cleared = softReset();
        showToast(
            cleared.length > 0
                ? `Cache cleared: ${cleared.join(", ")}`
                : "Cache cleared",
            Toasts.Type.SUCCESS
        );
    };

    return (
        <ChannelToolbarButton
            icon={CacheIcon}
            tooltip="Clear Cache"
            onClick={handleClick}
        />
    );
}

export default definePlugin({
    name: "CacheResetButton",
    description: "Adds a button to clear Discord cache to fix lag",
    tags: ["Utility", "Performance"],
    authors: [TestcordDevs.x2b],
    dependencies: ["HeaderBarAPI"],

    headerBarButton: {
        location: "channeltoolbar",
        icon: CacheIcon,
        render: CacheResetButton,
        priority: 260,
    },
});
