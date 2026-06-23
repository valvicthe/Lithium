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

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { find } from "@webpack";
import { React } from "@webpack/common";

import managedStyle from "./style.css?managed";

interface DiscordMemberDecorators {
    type?: (props: Record<string, unknown>) => React.ReactNode;
    __vcMemberListDecoratorsOriginal?: (props: Record<string, unknown>) => React.ReactNode;
}

interface ReactElementLike {
    type?: React.ElementType;
    props?: {
        children?: React.ReactNode | React.ReactNode[];
    } & Record<string, unknown>;
}

function injectAfterBotTag(originalOutput: React.ReactNode, props: Record<string, unknown>) {
    const customDecorators = Vencord.Api.MemberListDecorators.__getDecorators(props, "guild");

    if (typeof originalOutput !== "object" || originalOutput === null || !("props" in originalOutput)) {
        return <>{originalOutput}{customDecorators}</>;
    }

    const element = originalOutput as ReactElementLike;
    const elementProps = element.props;
    const children = elementProps?.children;
    if (!element.type || !elementProps || !Array.isArray(children)) {
        return <>{originalOutput}{customDecorators}</>;
    }

    const [botTag, ...rest] = children;
    const { children: originalChildren, ...propsWithoutChildren } = elementProps;
    return React.createElement(element.type, propsWithoutChildren, botTag, customDecorators, ...rest);
}

export default definePlugin({
    name: "MemberListDecoratorsAPI",
    description: "API to add decorators to member list (both in servers and DMs)",
    authors: [Devs.TheSun, Devs.Ven],
    required: true,

    managedStyle,

    start() {
        const decorators = find(m => m?.$$typeof && typeof m.type === "function" && String(m.type).includes("lostPermissionTooltipText"), { isIndirect: true }) as DiscordMemberDecorators | undefined;
        if (!decorators?.type || decorators.__vcMemberListDecoratorsOriginal) return;

        const original = decorators.type;
        decorators.__vcMemberListDecoratorsOriginal = original;
        decorators.type = function MemberListDecoratorsWrapper(props) {
            return injectAfterBotTag(original(props), props);
        };
    },

    stop() {
        const decorators = find(m => m?.$$typeof && typeof m.type === "function" && "__vcMemberListDecoratorsOriginal" in m, { isIndirect: true }) as DiscordMemberDecorators | undefined;
        if (decorators?.__vcMemberListDecoratorsOriginal) {
            decorators.type = decorators.__vcMemberListDecoratorsOriginal;
            delete decorators.__vcMemberListDecoratorsOriginal;
        }
    },

    patches: [
        {
            find: "PrivateChannel.renderAvatar",
            replacement: {
                match: /decorators:(\i\.isSystemDM\(\)\?.{0,100}:null)/,
                replace: "decorators:[Vencord.Api.MemberListDecorators.__getDecorators(arguments[0],'dm'),$1]"
            }
        },
        // fix discords styling for now
        {
            find: '"AvatarWithText"',
            replacement: [
                {
                    match: /(?<=className:.{0,10}),\{.{0,10}\}\)(?=,children:)/,
                    replace: ')+" vc-member-list-decorators-display-names"'
                },
                {
                    match: /(?<=className:\i\.\i)(?=,children:\i\}\))/,
                    replace: '+" vc-member-list-decorators-display-names"'
                }
            ]
        }
    ]
});
