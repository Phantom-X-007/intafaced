/**
 * Spanish vendor catalogue. Partial on purpose: missing keys fall through
 * to English via Vue-i18n fallbackLocale. Distinct bank title is the click.
 */
module.exports = {
    intafaced: {
        i18n: {
            label: "Idioma",
            en: "English",
            es: "Español",
            fr: "Français"
        },
        modules: {
            bank: {
                title: "Banco"
            }
        }
    }
};
