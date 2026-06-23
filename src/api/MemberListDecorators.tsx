/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import ErrorBoundary from "@components/ErrorBoundary";
import { Channel, User } from "@vencord/discord-types";
import { ChannelStore, GuildStore, React, UserStore } from "@webpack/common";
import { JSX } from "react";

import { isPluginEnabled, plugins } from "./PluginManager";

export type DecoratorProps = {
    type: "guild" | "dm";
    user?: User;
    /** only present when this is a DM list item */
    channel?: Channel;
    /** only present when this is a guild list item */
    isOwner?: boolean;
};

type RawDecoratorProps = Partial<DecoratorProps> & {
    userId?: string;
    member?: {
        user?: User;
        userId?: string;
    };
    guildId?: string;
    channelId?: string;
    guild?: {
        ownerId?: string;
    };
};

export type MemberListDecoratorFactory = (props: DecoratorProps) => JSX.Element | null;
type OnlyIn = "guilds" | "dms";

export const decoratorsFactories = new Map<string, { render: MemberListDecoratorFactory, onlyIn?: OnlyIn; }>();
const listeners = new Set<() => void>();
let syncedPluginDecorators = false;
const decoratorPriorities: Record<string, number> = {
    MoreUserTags: -20,
    PlatformIndicators: -10,
};

function emitChange() {
    for (const listener of listeners) listener();
}

export function addMemberListDecorator(identifier: string, render: MemberListDecoratorFactory, onlyIn?: OnlyIn) {
    decoratorsFactories.set(identifier, { render, onlyIn });
    emitChange();
}

export function removeMemberListDecorator(identifier: string) {
    decoratorsFactories.delete(identifier);
    emitChange();
}

function normalizeProps(props: RawDecoratorProps, type: "guild" | "dm"): DecoratorProps {
    const userId = props.user?.id ?? props.userId ?? props.member?.user?.id ?? props.member?.userId ?? props.channel?.recipients?.[0];
    const user = props.user ?? props.member?.user ?? (userId ? UserStore.getUser(userId) : undefined);
    const channel = props.channel ?? (props.channelId ? ChannelStore.getChannel(props.channelId) : undefined);
    const guildId = props.guildId ?? channel?.guild_id;
    const isOwner = props.isOwner ?? (user ? (props.guild?.ownerId ?? (guildId ? GuildStore.getGuild(guildId)?.ownerId : undefined)) === user.id : false);

    return { ...props, type, user, channel, isOwner };
}

export function __getDecorators(props: RawDecoratorProps, type: "guild" | "dm"): JSX.Element {
    syncPluginDecorators();
    return <MemberListDecorators props={props} type={type} />;
}

function syncPluginDecorators() {
    if (syncedPluginDecorators) return;
    syncedPluginDecorators = true;

    for (const [name, plugin] of Object.entries(plugins)) {
        if (name === "MemberListDecoratorsAPI" || !isPluginEnabled(name) || decoratorsFactories.has(name)) continue;
        if (plugin.renderMemberListDecorator) decoratorsFactories.set(name, { render: plugin.renderMemberListDecorator });
    }
}

function MemberListDecorators({ props, type }: { props: RawDecoratorProps; type: "guild" | "dm"; }) {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, []);

    const normalizedProps = normalizeProps(props, type);
    const decorators = Array.from(
        Array.from(decoratorsFactories.entries())
            .sort(([a], [b]) => (decoratorPriorities[a] ?? 0) - (decoratorPriorities[b] ?? 0)),
        ([key, { render: Decorator, onlyIn }]) => {
            if ((onlyIn === "guilds" && type !== "guild") || (onlyIn === "dms" && type !== "dm"))
                return null;

            return (
                <ErrorBoundary noop key={key} message={`Failed to render ${key} Member List Decorator`}>
                    <Decorator {...normalizedProps} />
                </ErrorBoundary>
            );
        }
    );

    return (
        <span className="vc-member-list-decorators-wrapper" data-op-member-list-decorator="true">
            {decorators}
        </span>
    );
}
