// The panel puts window.Kubek in place before any extension bundle loads
const kubek = window.Kubek!;

export const { React, ui, icons, http, query } = kubek;
export const h = React.createElement;
export const Fragment = React.Fragment;

export const useT = () => kubek.hooks.useTranslation().t;
export const useMask = () => kubek.hooks.useStreamerMask?.();
