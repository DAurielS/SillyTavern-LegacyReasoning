/**
 * Legacy Reasoning Parse Mode extension
 * Adds option to wait for both prefix and suffix before parsing reasoning during streaming
 */

// Import necessary functions/classes from SillyTavern scripts
import { extension_settings, getContext } from '../../../extensions.js'; // For settings and general context
import { saveSettingsDebounced, chat } from '../../../../script.js'; // For saving settings and getting the chat array
import { ReasoningHandler, ReasoningState } from '../../../reasoning.js'; // Direct import
import { power_user } from '../../../power-user.js'; // Import power_user settings
import { trimSpaces } from '../../../utils.js'; // Import utility

// Extension settings
const extensionName = 'SillyTavern-LegacyReasoning';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'legacy_reasoning_parse';

const defaultSettings = {
    enabled: false
};

// --- Settings Management ---
function loadSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    const settings = { ...defaultSettings, ...extension_settings[MODULE_NAME] };
    extension_settings[MODULE_NAME] = settings;
    const checkbox = document.getElementById('legacy_reasoning_parse_enabled');
    if (checkbox) {
        checkbox.checked = settings.enabled;
    }
    return settings;
}

function saveSettings() {
    saveSettingsDebounced();
}

function onSettingChange(event) {
    const settings = extension_settings[MODULE_NAME];
    if (settings) {
        settings.enabled = Boolean(event.target.checked);
        saveSettings();
    }
}

// --- Patching Logic ---
function applyPatch() {
    console.log(`${extensionName}: Attempting to apply patch to ReasoningHandler.process...`);

    if (!ReasoningHandler || !ReasoningHandler.prototype) {
        console.error(`${extensionName}: ReasoningHandler class or its prototype not found after import. Patching failed.`);
        return;
    }

    if (ReasoningHandler.prototype._legacyReasoningProcessPatched) {
        console.log(`${extensionName}: ReasoningHandler.process already patched.`);
        return;
    }

    const originalProcessFn = ReasoningHandler.prototype.process;

    if (typeof originalProcessFn !== 'function') {
        console.error(`${extensionName}: Original ReasoningHandler.process function not found. Patching aborted.`);
        return;
    }

    // Patch the public 'process' method
    ReasoningHandler.prototype.process = async function(messageId, mesChanged, promptReasoning) {
        const settings = extension_settings[MODULE_NAME];
        const shouldDelay = settings?.enabled &&
                            power_user.reasoning.auto_parse &&
                            power_user.reasoning.prefix && // Need prefix to check
                            this.state === ReasoningState.None;

        if (shouldDelay) {
            const message = chat[messageId];
            if (message) {
                const parseTarget = promptReasoning?.prefixIncomplete ?
                    (promptReasoning.prefixReasoningFormatted + message.mes) :
                    message.mes;

                const hasPrefix = parseTarget.startsWith(power_user.reasoning.prefix);
                // Check for suffix only if prefix is present
                const hasSuffix = hasPrefix && power_user.reasoning.suffix && parseTarget.includes(power_user.reasoning.suffix);

                // THE CORE LOGIC: Only delay if prefix is present BUT suffix is missing
                if (hasPrefix && !hasSuffix) {
                    console.log(`${extensionName}: Waiting for suffix (Prefix found). Stopping processing for this chunk.`);
                    return; // Stop processing this chunk, wait for more data
                }
                // If prefix is present AND suffix is present, OR if prefix is NOT present,
                // we fall through and let the original function handle it.
            }
        }

        // If extension is disabled, or state is not None, or prefix wasn't found,
        // or if both prefix and suffix were found (letting original handle it now),
        // call the original process function.
        return originalProcessFn.call(this, messageId, mesChanged, promptReasoning);
    };

    ReasoningHandler.prototype._legacyReasoningProcessPatched = true;
    console.log(`${extensionName}: Patched ReasoningHandler.process method (Minimal Hook Strategy).`);
}


// --- Initialization ---
jQuery(async () => {
    const settings = loadSettings();

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);

        const checkbox = document.getElementById('legacy_reasoning_parse_enabled');
        if (checkbox) {
            checkbox.checked = settings.enabled;
            checkbox.addEventListener('change', onSettingChange);
        } else {
            console.error(`${extensionName}: Could not find checkbox element after appending HTML.`);
        }

    } catch (error) {
        console.error(`${extensionName}: Failed to load settings HTML.`, error);
    }

    // Apply the patch directly
    applyPatch();

    console.log(`${extensionName} extension loaded.`);
});