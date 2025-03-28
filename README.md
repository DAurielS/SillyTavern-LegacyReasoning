# SillyTavern - Legacy Reasoning Parse Mode Extension

This is a simple UI Extension for SillyTavern that modifies the behavior of reasoning block parsing during response streaming.

## Features

- Adds a "Wait for Full Reasoning" toggle in the Extension Settings panel.
- When enabled, SillyTavern will wait until both the reasoning prefix AND suffix (as defined in `AI Response Formatting > Reasoning Formatting`) are detected in the streaming response before parsing the reasoning block and separating it from the main message content.
- When disabled (default), SillyTavern reverts to its standard behavior of parsing the reasoning block as soon as the prefix is detected.

## Why?

This restores an older behavior that some users might prefer if they struggle with thinking continuation due to auto-executing quick reply interactions or simply want to read the thought process during generation but have it auto collapse once it's finished thinking.

## Installation

Copy the repository link (https://github.com/DAurielS/SillyTavern-LegacyReasoning) and paste it into the Install Extension menu in the SillyTavern Extensions panel.

## Usage

1.  Go to the Extensions panel.
2.  Find the "Legacy Reasoning Parse Mode" settings section.
3.  Check the "Wait for Full Reasoning" checkbox to enable the legacy behavior. Uncheck it to use the default SillyTavern behavior.
4.  Ensure you have correctly configured your reasoning Prefix and Suffix in the `AI Response Formatting > Reasoning Formatting` settings for auto-parsing to work.

## How it Works

This extension patches the `ReasoningHandler.process` method in SillyTavern's core scripts. When enabled, it intercepts the processing of incoming text chunks. If a chunk contains the reasoning prefix but lacks the suffix, the extension prevents the default parsing logic from running until a subsequent chunk containing the suffix arrives. Once both are detected, it allows the original SillyTavern code to handle the parsing and display.

**Note:** This method relies on patching core functionality and might break if the underlying `ReasoningHandler.process` method changes significantly in future SillyTavern updates.