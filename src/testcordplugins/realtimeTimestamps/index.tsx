/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment, useCallback, useEffect, useReducer } from "@webpack/common";

// ─── Settings ────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Seconds format displayed on every message timestamp",
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in the hover tooltip",
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in compact mode",
        default: true,
    },
});

// ─── Shared global tick — one interval for all timestamps ────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;
let tickVersion = 0;
const tickListeners = new Set<() => void>();

function notifyTickListeners() {
    tickVersion++;
    for (const listener of tickListeners) listener();
}

function startTick() {
    if (tickInterval !== null) return;
    tickVersion = 0;
    tickInterval = setInterval(notifyTickListeners, 1000);
}

function stopTick() {
    if (tickInterval !== null) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
    tickVersion = 0;
    tickListeners.clear();
}

function subscribeTick(callback: () => void): () => void {
    tickListeners.add(callback);
    return () => { tickListeners.delete(callback); };
}

function getTickVersion() {
    return tickVersion;
}

// ─── Hook that re-renders on the global tick ─────────────────────────────────

function useGlobalTick() {
    const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
    useEffect(() => subscribeTick(forceUpdate), []);
}

// ─── Renderers called by the patches ─────────────────────────────────────────

function renderTimestamp(date: Date, type: "cozy" | "compact" | "tooltip"): string {
    useGlobalTick();

    const fmt = settings.store.format ?? "HH:mm:ss";

    switch (type) {
        case "cozy":
            return moment(date).format(fmt);
        case "compact":
            return settings.store.showInCompact
                ? moment(date).format(fmt)
                : moment(date).format("LT");
        case "tooltip":
            return settings.store.showInTooltip
                ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
                : moment(date).format("LLLL");
    }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RealtimeTimestamps",
    description: "Replaces Discord timestamps (e.g. 15:31) with live seconds (e.g. 15:34:21), updated every second.",
    tags: ["Appearance", "Chat", "Utility", "Nightcord"],
    authors: [{ name: "Nightcord", id: 253979869n }],
    settings,

    renderTimestamp,

    patches: [
        // ─── Main Timestamp component (cozy + compact messages + hover tooltip) ─
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            replacement: [
                {
                    // Compact mode: the useMemo that formats with "LT"
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderTimestamp(arguments[0].timestamp,'compact')",
                },
                {
                    // Cozy mode: the useMemo that calls the calendar/relative formatter
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderTimestamp(arguments[0].timestamp,'cozy')",
                },
                {
                    // Tooltip shown when hovering a message timestamp
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTimestamp(arguments[0].timestamp,'tooltip')",
                },
            ],
        },

        // ─── Timestamp markdown <t:unix:t> — hover tooltip ────────────────────
        {
            find: /.full,.{0,15}children:/,
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTimestamp(new Date(arguments[0].node.timestamp*1000),'tooltip')",
            },
        },
    ],

    start() {
        startTick();
    },

    stop() {
        stopTick();
    },
});
