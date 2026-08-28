const fileInput = document.querySelector("#fileInput");
const fileSummary = document.querySelector("#fileSummary");
const logRows = document.querySelector("#logRows");
const timeFromInput = document.querySelector("#timeFrom");
const timeToInput = document.querySelector("#timeTo");
const itemIdFilterInput = document.querySelector("#itemIdFilter");
const destinationFilterInput = document.querySelector("#destinationFilter");
const incomingRequestsFilterInput = document.querySelector("#incomingRequestsFilter");
const itemModeInputs = document.querySelectorAll('input[name="itemMode"]');
const destinationModeInputs = document.querySelectorAll('input[name="destinationMode"]');
const jsonDialog = document.querySelector("#jsonDialog");
const jsonDialogContent = document.querySelector("#jsonDialogContent");
const jsonDialogClose = document.querySelector("#jsonDialogClose");

let loadedLines = [];
let loadedFileName = "";

const logPrefixPattern =
  /^(?<timestamp>\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(?<level>[A-Z]+)\s+(?<details>.*)$/;
const newLogPrefixPattern =
  /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(?<level>[A-Z]+)\s+(?<details>.*)$/;

const deploymentPattern =
  /\b(?<itemId>DQ\d+)\s+(?<status>[A-Z_]+)\s+->(?<destination>[A-Z0-9_]+)\s+(?<step>[A-Z0-9_]+)\/(?<substep>[^:\s]+):\s*(?<message>.*)$/;
const newDeploymentPattern =
  /\b(?<itemId>DQ\d+)\s+(?<status>[A-Z_]+)\s+->\[(?<destination>[^\]]+)\]\s+(?:.*\s)?(?<step>[A-Z0-9_]+)\/(?<substep>[^:\s]+):\s*(?<message>.*)$/;
const maxMessageLength = 2048;
const incomingRequestPhrases = [
  "incoming JSON Deployment request",
  "deployment request stored",
  "incoming JSON Maintenance request",
  "maintenance request stored",
];

jsonDialogClose.addEventListener("click", () => {
  jsonDialog.close();
});

jsonDialog.addEventListener("click", (event) => {
  if (event.target === jsonDialog) {
    jsonDialog.close();
  }
});

for (const control of [
  timeFromInput,
  timeToInput,
  itemIdFilterInput,
  destinationFilterInput,
  incomingRequestsFilterInput,
  ...itemModeInputs,
  ...destinationModeInputs,
]) {
  control.addEventListener("input", applyFilters);
  control.addEventListener("change", applyFilters);
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    loadedLines = [];
    loadedFileName = "";
    renderEmpty("No file selected.");
    fileSummary.textContent = "Select a local log file to inspect parsed deployment entries.";
    return;
  }

  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    loadedLines = lines.map(parseLine);
    loadedFileName = file.name;
    applyFilters();
  } catch (error) {
    renderError(`Could not read file: ${error.message}`);
    fileSummary.textContent = "File could not be loaded.";
  }
});

function parseLine(rawLine) {
  const prefixMatch = rawLine.match(logPrefixPattern) ?? rawLine.match(newLogPrefixPattern);
  const timestamp = prefixMatch?.groups?.timestamp ?? "";
  const level = prefixMatch?.groups?.level ?? "";
  const searchableText = prefixMatch?.groups?.details ?? rawLine;
  const deploymentMatch =
    searchableText.match(deploymentPattern) ?? searchableText.match(newDeploymentPattern);
  const timeValue = parseLogTimestamp(timestamp);

  if (!deploymentMatch?.groups) {
    const jsonText = findJsonText(searchableText);

    return {
      rawLine,
      messageText: truncateMessage(searchableText),
      jsonText,
      timestamp,
      timeValue,
      level,
      deployment: null,
    };
  }

  const deploymentMessage = deploymentMatch.groups.message;

  return {
    rawLine,
    timestamp,
    timeValue,
    level,
    jsonText: findJsonText(deploymentMessage),
    deployment: {
      itemId: deploymentMatch.groups.itemId,
      status: deploymentMatch.groups.status,
      destination: deploymentMatch.groups.destination,
      step: deploymentMatch.groups.step,
      substep: deploymentMatch.groups.substep,
      message: truncateMessage(deploymentMessage),
    },
  };
}

function applyFilters() {
  if (loadedLines.length === 0) {
    renderEmpty(loadedFileName ? "The selected file has no log lines." : "No file selected.");

    if (loadedFileName) {
      updateSummary(0);
    }

    return;
  }

  const filters = getFilters();
  const filteredLines = loadedLines
    .filter((line) => isInsideTimeRange(line, filters))
    .filter((line) => isIncomingRequestMatch(line, filters))
    .filter((line) => shouldKeepForDataFilter(line, filters));
  const annotatedLines = filteredLines.map((line) => ({
    ...line,
    highlights: getHighlights(line, filters),
  }));

  renderRows(annotatedLines, "No log lines match the active filters.");
  updateSummary(annotatedLines.length);
}

function getFilters() {
  return {
    timeFrom: parseDateTimeInput(timeFromInput.value),
    timeTo: parseDateTimeInput(timeToInput.value),
    itemId: itemIdFilterInput.value.trim().toUpperCase(),
    itemMode: getSelectedMode(itemModeInputs),
    destination: destinationFilterInput.value.trim().toUpperCase(),
    destinationMode: getSelectedMode(destinationModeInputs),
    incomingRequestsOnly: incomingRequestsFilterInput.checked,
  };
}

function getSelectedMode(inputs) {
  return [...inputs].find((input) => input.checked)?.value ?? "filter";
}

function isInsideTimeRange(line, filters) {
  if (!filters.timeFrom && !filters.timeTo) {
    return true;
  }

  if (!line.timeValue) {
    return false;
  }

  if (filters.timeFrom && line.timeValue < filters.timeFrom) {
    return false;
  }

  if (filters.timeTo && line.timeValue > filters.timeTo) {
    return false;
  }

  return true;
}

function shouldKeepForDataFilter(line, filters) {
  if (!line.deployment) {
    return !hasActiveFilterMode(filters.itemId, filters.itemMode) &&
      !hasActiveFilterMode(filters.destination, filters.destinationMode);
  }

  if (
    hasActiveFilterMode(filters.itemId, filters.itemMode) &&
    !fieldMatches(line.deployment.itemId, filters.itemId)
  ) {
    return false;
  }

  if (
    hasActiveFilterMode(filters.destination, filters.destinationMode) &&
    !fieldMatches(line.deployment.destination, filters.destination)
  ) {
    return false;
  }

  return true;
}

function isIncomingRequestMatch(line, filters) {
  if (!filters.incomingRequestsOnly) {
    return true;
  }

  return incomingRequestPhrases.some((phrase) => line.rawLine.includes(phrase));
}

function hasActiveFilterMode(value, mode) {
  return value.length > 0 && mode === "filter";
}

function getHighlights(line, filters) {
  if (!line.deployment) {
    return {};
  }

  return {
    itemId:
      filters.itemId.length > 0 &&
      filters.itemMode === "highlight" &&
      fieldMatches(line.deployment.itemId, filters.itemId),
    destination:
      filters.destination.length > 0 &&
      filters.destinationMode === "highlight" &&
      fieldMatches(line.deployment.destination, filters.destination),
  };
}

function fieldMatches(value, filterValue) {
  return value.toUpperCase().includes(filterValue);
}

function updateSummary(visibleCount) {
  const parsedCount = loadedLines.filter((line) => line.deployment).length;
  const visibleText =
    visibleCount === loadedLines.length ? "" : ` ${visibleCount} visible after filters.`;

  fileSummary.textContent = `${loadedFileName}: ${loadedLines.length} line${
    loadedLines.length === 1 ? "" : "s"
  }, ${parsedCount} parsed deployment entr${parsedCount === 1 ? "y" : "ies"}.${visibleText}`;
}

function renderRows(lines, emptyMessage = "The selected file has no log lines.") {
  if (lines.length === 0) {
    renderEmpty(emptyMessage);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const line of lines) {
    const row = document.createElement("tr");
    row.className = line.deployment ? "parsed" : "raw";

    if (line.deployment) {
      appendCell(row, line.timestamp || "-");
      appendCell(row, line.level || "-");
      appendCell(row, line.deployment.itemId, line.highlights?.itemId ? "highlight" : "");
      appendStatusCell(row, line.deployment.status);
      appendCell(row, line.deployment.destination, line.highlights?.destination ? "highlight" : "");
      appendCell(row, line.deployment.step);
      appendCell(row, line.deployment.substep);
      appendMessageCell(row, line.deployment.message || "-", line.jsonText);
    } else {
      appendCell(row, line.timestamp || "-", "muted");
      appendCell(row, line.level || "-", "muted");
      appendMessageCell(row, line.messageText || line.rawLine, line.jsonText, "raw-message", 6);
    }

    fragment.append(row);
  }

  logRows.replaceChildren(fragment);
}

function parseLogTimestamp(timestamp) {
  const oldFormatMatch = timestamp.match(
    /^(?<year>\d{4})\.(?<month>\d{2})\.(?<day>\d{2})\s+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$/,
  );
  const newFormatMatch = timestamp.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})\s+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}),(?<millisecond>\d{3})$/,
  );
  const match = oldFormatMatch ?? newFormatMatch;

  if (!match?.groups) {
    return null;
  }

  return new Date(
    Number(match.groups.year),
    Number(match.groups.month) - 1,
    Number(match.groups.day),
    Number(match.groups.hour),
    Number(match.groups.minute),
    Number(match.groups.second),
    Number(match.groups.millisecond ?? 0),
  ).getTime();
}

function parseDateTimeInput(value) {
  if (!value) {
    return null;
  }

  return new Date(value).getTime();
}

function truncateMessage(message) {
  if (message.length <= maxMessageLength) {
    return message;
  }

  return `${message.slice(0, maxMessageLength)}...`;
}

function findJsonText(message) {
  for (let index = 0; index < message.length; index += 1) {
    const char = message[index];

    if (char !== "{" && char !== "[") {
      continue;
    }

    const candidate = readBalancedJsonCandidate(message, index);

    if (!candidate) {
      continue;
    }

    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function readBalancedJsonCandidate(text, startIndex) {
  const opening = text[startIndex];
  const closing = opening === "{" ? "}" : "]";
  const stack = [closing];
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) {
        return "";
      }

      stack.pop();

      if (stack.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return "";
}

function appendCell(row, value, className = "", colSpan = 1) {
  const cell = document.createElement("td");
  cell.textContent = value;

  if (colSpan > 1) {
    cell.colSpan = colSpan;
  }

  if (className) {
    cell.className = className;
  }

  row.append(cell);
}

function appendMessageCell(row, value, jsonText, className = "", colSpan = 1) {
  const cell = document.createElement("td");
  const messageText = document.createElement("span");
  messageText.textContent = value;
  cell.append(messageText);

  if (jsonText) {
    const button = document.createElement("button");
    button.className = "json-button";
    button.type = "button";
    button.textContent = "{}";
    button.title = "Show JSON";
    button.setAttribute("aria-label", "Show JSON");
    button.addEventListener("click", () => showJsonDialog(jsonText));
    cell.append(button);
  }

  if (colSpan > 1) {
    cell.colSpan = colSpan;
  }

  if (className) {
    cell.className = className;
  }

  row.append(cell);
}

function showJsonDialog(jsonText) {
  try {
    jsonDialogContent.textContent = JSON.stringify(JSON.parse(jsonText), null, 2);
  } catch {
    jsonDialogContent.textContent = jsonText;
  }

  jsonDialog.showModal();
}

function appendStatusCell(row, status) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `status ${status.toLowerCase() === "deploying" ? "deploying" : "default"}`;
  badge.textContent = status;
  cell.append(badge);
  row.append(cell);
}

function renderEmpty(message) {
  logRows.innerHTML = `<tr class="empty-row"><td colspan="8"></td></tr>`;
  logRows.querySelector("td").textContent = message;
}

function renderError(message) {
  logRows.innerHTML = `<tr class="error-row"><td colspan="8"></td></tr>`;
  logRows.querySelector("td").textContent = message;
}
