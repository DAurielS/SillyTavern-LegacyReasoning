/**
 * Legacy Reasoning Parse Mode extension
 * Adds option to wait for both prefix and suffix before parsing reasoning during streaming
 */

// Extension settings
const MODULE_NAME = 'legacy_reasoning_parse';
const defaultSettings = {
    enabled: false
};

let originalParseFunction = null;

$(document).ready(function() {
    // Add UI elements
    const settingsHtml = `
        <div class="flex-container alignItemsBaseline">
            <label class="checkbox_label flex1" for="legacy_reasoning_parse_enabled" title="Wait for both prefix and suffix to appear before parsing reasoning. If disabled, parsing begins as soon as prefix appears." data-i18n="[title]reasoning_parse_mode">
                <input id="legacy_reasoning_parse_enabled" type="checkbox" />
                <small data-i18n="Wait for Full Reasoning">
                    Wait for Full Reasoning
                </small>
            </label>
        </div>
    `;

    $('#extension_settings').append(settingsHtml);

    // Load settings
    const settings = loadSettings();
    $('#legacy_reasoning_parse_enabled').prop('checked', settings.enabled);

    // Event listener for toggle
    $('#legacy_reasoning_parse_enabled').on('change', function() {
        settings.enabled = $(this).prop('checked');
        saveSettings(settings);
    });

    // Hook into reasoning parser
    const reasoningHandler = SillyTavern.getContext().ReasoningHandler;
    if (reasoningHandler && reasoningHandler.prototype) {
        const originalFn = reasoningHandler.prototype['#autoParseReasoningFromMessage'];
        
        reasoningHandler.prototype['#autoParseReasoningFromMessage'] = function(messageId, mesChanged, promptReasoning) {
            const settings = extension_settings[MODULE_NAME];
            const power_user = SillyTavern.getContext().power_user;

            if (!settings?.enabled) {
                return originalFn.call(this, messageId, mesChanged, promptReasoning);
            }

            // Skip if auto-parse is disabled or prefix/suffix not set
            if (!power_user.reasoning.auto_parse || !power_user.reasoning.prefix || !power_user.reasoning.suffix) {
                return mesChanged;
            }

            const message = SillyTavern.getContext().chat[messageId];
            if (!message) return mesChanged;

            const parseTarget = promptReasoning?.prefixIncomplete ? 
                (promptReasoning.prefixReasoningFormatted + message.mes) : 
                message.mes;

            // Only parse if we have both prefix and suffix
            if (this.state === SillyTavern.getContext().ReasoningState.None) {
                if (parseTarget.startsWith(power_user.reasoning.prefix) && 
                    parseTarget.includes(power_user.reasoning.suffix) && 
                    parseTarget.length > power_user.reasoning.prefix.length) {
                    
                    // Extract reasoning directly since we have both prefix and suffix
                    const reasoning = parseTarget.slice(
                        power_user.reasoning.prefix.length, 
                        parseTarget.indexOf(power_user.reasoning.suffix)
                    );
                    this.reasoning = reasoning;
                    
                    // Extract message content after suffix
                    message.mes = SillyTavern.getContext().trimSpaces(
                        parseTarget.slice(
                            parseTarget.indexOf(power_user.reasoning.suffix) + 
                            power_user.reasoning.suffix.length
                        )
                    );

                    // Set state and timing info 
                    this.state = SillyTavern.getContext().ReasoningState.Done;
                    this.startTime = this.startTime ?? this.initialTime;
                    this.endTime = new Date();
                }
                return mesChanged;
            }

            // For other states, use original parsing
            return originalFn.call(this, messageId, mesChanged, promptReasoning);
        };
    }
});

// Helper functions
function loadSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    return extension_settings[MODULE_NAME];
}

function saveSettings(settings) {
    extension_settings[MODULE_NAME] = settings;
    saveSettingsDebounced();
}