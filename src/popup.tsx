import { compile } from "micromustache";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ThemeProvider from "@mui/system/ThemeProvider";
import { PurpleTheme } from "./theme";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MaterialAlert from "@mui/material/Alert";

import Alert from "./components/Alert";
import { AlertStatus, ExtensionSettings, OutputPreset } from "./types";
import { getSettings, obsidianRequest } from "./utils";
import RequestParameters from "./components/RequestParameters";

const Popup = () => {
  const [status, setStatus] = useState<AlertStatus>();

  const [ready, setReady] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [method, setMethod] = useState<OutputPreset["method"]>("post");
  const [compiledUrl, setCompiledUrl] = useState<string>("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [compiledContent, setCompiledContent] = useState<string>("");

  const [presets, setPresets] = useState<OutputPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<number>(0);

  useEffect(() => {
    async function handle() {
      let tab: chrome.tabs.Tab;
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tab = tabs[0];
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: "Could not get current tab!",
        });
        return;
      }

      if (!tab.id) {
        return;
      }
      let items: ExtensionSettings;

      try {
        items = await getSettings(chrome.storage.sync);
        setPresets(items.presets);
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: "Could not get settings!",
        });
        return;
      }

      let selectedText: string;
      try {
        const selectedTextInjected = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString(),
        });
        selectedText = selectedTextInjected[0].result;
      } catch (e) {
        selectedText = "";
      }

      const preset = items.presets[selectedPreset];

      const context = {
        page: {
          url: tab.url,
          title: tab.title,
          selectedText: selectedText,
        },
      };

      setApiKey(items.apiKey);
      setMethod(preset.method as OutputPreset["method"]);
      setCompiledUrl(compile(preset.urlTemplate).render(context));
      setHeaders(preset.headers);
      setCompiledContent(compile(preset.contentTemplate).render(context));
      setReady(true);
    }

    handle();
  }, [selectedPreset]);

  const sendToObsidian = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab.id) {
      return;
    }

    const request: RequestInit = {
      method: method,
      body: compiledContent,
      headers,
    };
    const result = await obsidianRequest(apiKey, compiledUrl, request);

    if (result.status < 300) {
      setStatus({
        severity: "success",
        title: "All done!",
        message: "Your content was sent to Obsidian successfully.",
      });
      setTimeout(() => window.close(), 2000);
    } else {
      const body = await result.json();
      setStatus({
        severity: "error",
        title: "Error",
        message: `Could not send content to Obsidian: (Code ${body.errorCode}) ${body.message}`,
      });
    }
  };

  return (
    <ThemeProvider theme={PurpleTheme}>
      {ready && (
        <>
          {apiKey.length === 0 && (
            <>
              <MaterialAlert severity="error">
                No API Key is set in your settings.
              </MaterialAlert>
              <Button
                variant="contained"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                Go to settings
              </Button>
            </>
          )}
          {apiKey && (
            <>
              <div className="option">
                <div className="option-value">
                  <Select
                    label="Preset"
                    value={selectedPreset}
                    onChange={(event) =>
                      setSelectedPreset(
                        typeof event.target.value === "number"
                          ? event.target.value
                          : parseInt(event.target.value, 10)
                      )
                    }
                  >
                    {presets.map((preset, idx) => (
                      <MenuItem key={preset.name} value={idx}>
                        {preset.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <Button variant="contained" onClick={sendToObsidian}>
                    Send to Obsidian
                  </Button>
                </div>
              </div>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Entry Details</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <RequestParameters
                    method={method}
                    url={compiledUrl}
                    headers={headers}
                    content={compiledContent}
                    onChangeMethod={setMethod}
                    onChangeUrl={setCompiledUrl}
                    onChangeHeaders={setHeaders}
                    onChangeContent={setCompiledContent}
                  />
                </AccordionDetails>
              </Accordion>
            </>
          )}
        </>
      )}
      {status && <Alert value={status} />}
    </ThemeProvider>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
  document.getElementById("root")
);