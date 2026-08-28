# JS Log Viewer

A small dependency-free JavaScript log viewer for inspecting local log files in the browser.

## Usage

Open `index.html` in a browser and choose a local `.log` or `.txt` file.

The file stays local. The app uses the browser File API and does not upload the selected file anywhere.

## Log Format

The viewer understands log lines with a timestamp and log level like:

```text
2026.08.03 10:17:34 INFO  class namespace.method(source:107): message.
```

It also supports the newer format with millisecond timestamps and WebLogic thread details:

```text
2026-08-12 12:11:21,636 INFO [[ACTIVE] ExecuteThread: '183' for queue: 'weblogic.kernel.Default (self-tuning)'] ns.class [source:119] DQ1234 NEW ->[dest] (app) type@OS env - env step/-: Running step STEP with target: null
```

If the line contains deployment data like this:

```text
DQ1234 DEPLOYING ->dest STEP/step1: message.
```

it is parsed into these columns:

- `Item Id`: `DQ1234`
- `Status`: `DEPLOYING`
- `Destination`: `dest`
- `Deployment Step`: `STEP`
- `Substep`: `step1`
- `Message`: text after the colon

Lines without deployment data keep their timestamp and level, then show the remaining message text in one merged table cell.

## Filters

The filter panel stays visible on the left side while scrolling.

- `From` and `To` always filter the visible log lines by timestamp.
- `Item Id` can either filter rows or highlight matching item ids.
- `Destination` can either filter rows or highlight matching destinations.
- `Incoming requests` shows only lines containing one of the configured incoming request phrases.

When Item Id or Destination is in filter mode, rows without parsed deployment data are hidden if that filter has a value.

## JSON Viewer

If a message contains valid JSON, a small `{}` button appears at the end of the message. Click it to open the JSON in a popup, formatted with indentation.

## Performance

Messages longer than 2048 characters are truncated during parsing and get `...` appended. This keeps very large log lines from slowing down table rendering.

## Files

- `index.html`: page markup and controls
- `styles.css`: layout and table styling
- `app.js`: file loading, parsing, filtering, highlighting, and rendering
