/**
 * Legacy Reasoning Parse Mode extension
 * Adds option to wait for both prefix and suffix before parsing reasoning during streaming
 */


import { extension_settings, getContext, loadExtensionSettings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

// Extension settings
const extensionName = 'SillyTavern-LegacyReasoning'; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`; 
const MODULE_NAME = 'legacy_reasoning_parse';

const defaultSettings = {
    enabled: false
};

// Function to load settings
function loadSettings() {
    // Ensure the main settings object exists
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};

    // Merge defaults (useful for adding new settings later)
    const settings = { ...defaultSettings, ...extension_settings[MODULE_NAME] };
    extension_settings[MODULE_NAME] = settings; // Store merged settings

    // Update UI elements if they exist
    const checkbox = document.getElementById('legacy_reasoning_parse_enabled');
    if (checkbox) {
        checkbox.checked = settings.enabled;
    }

    return settings;
}

// Function to save settings
function saveSettings() {
    saveSettingsDebounced();
}

// Function to handle checkbox changes
function onSettingChange(event) {
    const settings = extension_settings[MODULE_NAME];
    if (settings) {
        settings.enabled = Boolean(event.target.checked);
        saveSettings();
        // Re-apply patch status might be needed if the patch logic depends on the setting dynamically
        // applyPatch(); // Consider if needed, might be overkill if patch only checks on load
    }
}


// Function to apply the patch
function applyPatch() {
    const context = getContext();
    if (!context) {
        console.error(`${extensionName}: Could not get SillyTavern context.`);
        return;
    }
    const reasoningHandler = context.ReasoningHandler;

    if (reasoningHandler && reasoningHandler.prototype && !reasoningHandler.prototype._legacyReasoningPatched) {
        // Find the original private method name (this is fragile)
        const originalFnKey = Object.getOwnPropertyNames(reasoningHandler.prototype)
                                  .find(key => key.includes('autoParseReasoningFromMessage'));

        if (!originalFnKey) {
             console.error(`${extensionName}: Could not find the original #autoParseReasoningFromMessage method. Patching aborted.`);
             return;
        }
        const originalFn = reasoningHandler.prototype[originalFnKey];
        console.log(`${extensionName}: Found original method key: ${originalFnKey}`);


        reasoningHandler.prototype[originalFnKey] = function(messageId, mesChanged, promptReasoning) {
            // Use the MODULE_NAME key to get settings
            const settings = extension_settings[MODULE_NAME];
            const power_user = context.power_user;
            const { ReasoningState, chat, trimSpaces } = context;

            // If extension is disabled, call original function
            if (!settings?.enabled) {
                return originalFn.call(this, messageId, mesChanged, promptReasoning);
            }

            // Skip if core auto-parse is disabled or prefix/suffix not set
            if (!power_user.reasoning.auto_parse || !power_user.reasoning.prefix || !power_user.reasoning.suffix) {
                return originalFn.call(this, messageId, mesChanged, promptReasoning);
            }

            const message = chat[messageId];
            if (!message) return mesChanged;

            const parseTarget = promptReasoning?.prefixIncomplete ?
                (promptReasoning.prefixReasoningFormatted + message.mes) :
                message.mes;


            if (this.state === ReasoningState.None) {
                // Only parse if we have both prefix and suffix
                if (parseTarget.startsWith(power_user.reasoning.prefix) &&
                    parseTarget.includes(power_user.reasoning.suffix) &&
                    parseTarget.length > power_user.reasoning.prefix.length) {

                    // Extract reasoning directly
                    const suffixIndex = parseTarget.indexOf(power_user.reasoning.suffix);
                    const reasoning = parseTarget.slice(
                        power_user.reasoning.prefix.length,
                        suffixIndex
                    );
                    this.reasoning = reasoning;

                    // Extract message content after suffix
                    const mesStartIndex = suffixIndex + power_user.reasoning.suffix.length;
                    message.mes = trimSpaces(parseTarget.slice(mesStartIndex));

                    // Set state and timing info
                    this.state = ReasoningState.Done;
                    this.startTime = this.startTime ?? this.initialTime;
                    this.endTime = new Date();

                    return mesChanged || (message.mes !== parseTarget.slice(mesStartIndex));
                }
                // If conditions not met, let the original function handle it
                return originalFn.call(this, messageId, mesChanged, promptReasoning);
            }

            // For other states, let the original function handle parsing logic
            return originalFn.call(this, messageId, mesChanged, promptReasoning);
        };

        reasoningHandler.prototype._legacyReasoningPatched = true; // Mark as patched
        console.log(`${extensionName}: Patched ReasoningHandler method ${originalFnKey}.`);

    } else if (reasoningHandler && reasoningHandler.prototype._legacyReasoningPatched) {
        console.log(`${extensionName}: Already patched.`);
    } else {
        console.error(`${extensionName}: Could not find ReasoningHandler or its prototype.`);
    }
}


// This function runs when the extension is loaded.
jQuery(async () => {
    // Load settings first
    const settings = loadSettings();

    // Load the HTML template
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // Append settingsHtml to the settings panel
        // Using #extensions_settings based on the example
        $("#extensions_settings").append(settingsHtml);

        // Now that the HTML is added, find the checkbox and attach the listener
        const checkbox = document.getElementById('legacy_reasoning_parse_enabled');
        if (checkbox) {
            checkbox.checked = settings.enabled; // Ensure it reflects loaded settings
            checkbox.addEventListener('change', onSettingChange);
        } else {
            console.error(`${extensionName}: Could not find checkbox element after appending HTML.`);
        }

    } catch (error) {
        console.error(`${extensionName}: Failed to load settings HTML.`, error);
    }

    // Apply the patch to the reasoning handler
    applyPatch();

    console.log(`${extensionName} extension loaded.`);
});