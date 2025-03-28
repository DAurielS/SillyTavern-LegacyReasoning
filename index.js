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

        // If extension is enabled and conditions are right, apply custom logic
        if (settings?.enabled &&
            power_user.reasoning.auto_parse &&
            power_user.reasoning.prefix &&
            power_user.reasoning.suffix &&
            this.state === ReasoningState.None // Only apply when no reasoning state is set yet
           )
        {
            const message = chat[messageId];
            if (message) {
                const parseTarget = promptReasoning?.prefixIncomplete ?
                    (promptReasoning.prefixReasoningFormatted + message.mes) :
                    message.mes;

                // Check for prefix and suffix before proceeding
                if (parseTarget.startsWith(power_user.reasoning.prefix) &&
                    parseTarget.includes(power_user.reasoning.suffix) &&
                    parseTarget.length > power_user.reasoning.prefix.length)
                {
                    console.log(`${extensionName}: Applying legacy parse logic.`);
                    // Extract reasoning directly
                    const suffixIndex = parseTarget.indexOf(power_user.reasoning.suffix);
                    const reasoning = parseTarget.slice(
                        power_user.reasoning.prefix.length,
                        suffixIndex
                    );
                    this.reasoning = reasoning; // Set public property

                    // Extract message content after suffix
                    const mesStartIndex = suffixIndex + power_user.reasoning.suffix.length;
                    message.mes = trimSpaces(parseTarget.slice(mesStartIndex));

                    // Set state and timing info directly
                    this.state = ReasoningState.Done; // Set public property
                    this.startTime = this.startTime ?? this.initialTime;
                    this.endTime = new Date();

                    // We've handled the initial parsing part. Now, let the rest of the original
                    // 'process' function handle state updates, DOM updates, etc.
                    // We need to call the *rest* of the original process logic, *skipping* its
                    // internal call to #autoParseReasoningFromMessage for this specific case.
                    // Since we can't easily skip just that part, we'll call the original function
                    // but be aware it might try to re-parse. However, since `this.state` is now `Done`,
                    // the original #autoParseReasoningFromMessage should ideally do nothing further.
                    // We also need to update `mesChanged` if we modified `message.mes`.
                    const originalMesChanged = mesChanged;
                    mesChanged = mesChanged || (message.mes !== parseTarget.slice(mesStartIndex));

                    // Call the original process, but let it know mes might have changed
                    // It will handle the logic from line 370 onwards in reasoning.js
                    return originalProcessFn.call(this, messageId, mesChanged, promptReasoning);

                } else {
                    // Conditions for legacy parse not met (e.g., suffix not present yet)
                    // In this specific state (enabled, auto_parse, None state),
                    // prevent the default parsing from happening yet.
                    // We essentially do nothing and wait for more streaming data.
                    console.log(`${extensionName}: Waiting for full reasoning block.`);
                    // We need to prevent the original process from running its #autoParse... call
                    // For now, let's just return, effectively stopping processing for this chunk.
                    // This might have side effects if other parts of 'process' are crucial even
                    // when reasoning isn't fully formed. A more complex patch might be needed
                    // to replicate the latter half of 'process' here.
                    // Let's try returning first.
                    return; // Stop processing this chunk, wait for more data
                }
            }
        }

        // If extension is disabled, or conditions weren't met for custom logic,
        // call the original process function directly.
        return originalProcessFn.call(this, messageId, mesChanged, promptReasoning);
    };

    ReasoningHandler.prototype._legacyReasoningProcessPatched = true;
    console.log(`${extensionName}: Patched ReasoningHandler.process method.`);
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