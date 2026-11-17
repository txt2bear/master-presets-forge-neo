(() => {
    "use strict";

    const API = "/master-presets/data";
    const UI_ID = "master-presets";
    const MAX_QUICK_DIMENSIONS = 16;
    const COLLAPSE_KEY_PREFIX = "masterPresets.collapsed.";
    const PROMPT_MODE_KEY_PREFIX = "masterPresets.promptMode.";
    const PROMPT_MODES = ["replace", "prepend", "append"];
    const PROMPT_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10zM13 3v7h7M8 13h8m-8 4h8"/></svg>';
    const TRASH_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6"/></svg>';
    const DIFF_DELAY_MS = 500; // hover dwell time before the card shows preset details

    // ---- Bridge layer (bridge.js) --------------------------------------
    // All contact with Forge/Gradio DOM lives in bridge.js: value reading,
    // native setters, Svelte dropdown selection, UI-preset settle waits.
    // Consume it here; do not reimplement it or add state/UI logic to it.
    const bridge = window.MasterPresetsBridge;
    if (!bridge) {
        throw new Error("[Master Presets] bridge.js did not load - extension disabled.");
    }
    const {
        controlIds, getRoot, normalizeText, readValue,
        setSimpleValue, sleep, optionMatches, pickDropdownOption, dropdownValue,
        sameTokenSet, setNumericIfChanged, waitForPresetSettle, setMultiDropdown,
        readCurrentSize, checkboxValue, setCheckbox,
    } = bridge;

    const state = {
        presets: {},
        quickDimensions: [],
        presetOrder: [],
        formatOrder: ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"],
        formatNames: {},
        selected: null,
        busy: false,
        dimensionLinks: {
            txt2img: { enabled: false, ratio: null },
            img2img: { enabled: false, ratio: null },
        },
        snap64: {
            txt2img: localStorage.getItem("masterPresets.snap64.txt2img") === "1",
            img2img: localStorage.getItem("masterPresets.snap64.img2img") === "1",
        },
        promptModes: {
            txt2img: readPromptMode("txt2img"),
            img2img: readPromptMode("img2img"),
        },
        dimensionSync: false,
        drag: null,
    };

    const i18n = {
        en: {
            title: "Master Presets",
            empty: "No presets yet",
            emptySizes: "No quick sizes yet",
            name: "Preset name",
            save: "Save preset",
            prompts: "Save prompts",
            presetPrompts: "Preset prompts",
            savedPositive: "Positive prompt saved · Negative prompt is empty",
            savedNegative: "Negative prompt saved · Positive prompt is empty",
            savedBoth: "Both prompts saved",
            savedEmpty: "Saved prompts are empty",
            replace: "Replace",
            prepend: "At start",
            append: "At end",
            deleteItem: "Delete {name}",
            delete: "Delete selected",
            overwrite: "A preset with this name already exists. Overwrite it?",
            confirmDelete: "Delete preset \"{name}\"?",
            saved: "Preset saved",
            deleted: "Preset deleted",
            applied: "Preset applied",
            failed: "Could not save presets",
            missingName: "Enter a preset name",
            checkpoint: "Checkpoint",
            modules: "VAE / Text Encoders",
            forgePreset: "UI Preset",
            dtype: "Low bits",
            size: "Size",
            steps: "Steps",
            cfg: "CFG",
            distilled: "Distilled CFG",
            sampler: "Sampler",
            scheduler: "Scheduler",
            styles: "Styles",
            noModules: "None",
            noSelection: "Select a preset",
            export: "Export",
            import: "Import",
            imported: "Presets imported",
            importError: "Invalid preset file",
            tooltipSave: "Save the current Forge setup as a Master Preset",
            tooltipDelete: "Delete the selected preset",
            tooltipExport: "Export all Master Presets and Quick Dimensions to JSON",
            tooltipImport: "Import Master Presets and Quick Dimensions from JSON",
            manage: "Manage presets",
            addSize: "Save size",
            sizeAdded: "Quick size added",
            sizeRemoved: "Quick size removed",
            sizeExists: "This quick size already exists",
            sizeMissing: "Current width / height not found",
            baseSize: "Preset size",
            rotate: "↔ Orientation",
            tooltipBase: "Apply the size saved in the selected preset",
            tooltipRotate: "Swap width and height",
            tooltipAddSize: "Save the current width and height as a Quick Dimensions button",
            quickSizes: "Dimensions",
            aspectRatios: "Format",
            transform: "Transform",
            sizeName: "Size name (optional)",
            sizeRenamed: "Quick size renamed",
            selectedPreset: "Selected preset",
            collapse: "Collapse Master Presets",
            expand: "Expand Master Presets",
            linkSize: "W ↔ H",
            unlinkSize: "W ↔ H",
            snap64: "×64",
            scale05: "0.5x",
            scale075: "0.75x",
            scale15: "1.5x",
            scale20: "2.0x",
            tooltipLink: "Keep the current aspect ratio when Width or Height changes",
            tooltipSnap64: "Keep automatic size changes and linked dimensions divisible by 64",
            preview: "Live preview",
            applyWarn: "Applied, but check these: {detail}",
            applyTimeout: "UI preset / model switched slowly — see console",
            diffSame: "Matches current settings",
            diffReplace: "Will replace current text",
            diffPrepend: "Will add at the start",
            diffAppend: "Will add at the end",
            applyFailed: "Could not apply preset",
            unavailableUiPreset: 'UI Preset "{name}" is unavailable in Forge Neo.',
            unavailableCheckpoint: 'Checkpoint "{name}" is unavailable. Install the model or refresh the checkpoint list.',
            unavailableModules: "Could not load VAE / Text Encoders: {names}",
            seed: "Seed",
            hires: "Hires fix",
            hrScale: "Upscale by",
            hrSteps: "Hires steps",
            hrDenoise: "Denoising",
            hrUpscaler: "Upscaler",
            on: "on",
            off: "off",
            saveAsFormat: "Save as format",
            tooltipSaveAsFormat: "Save the current width and height as a named aspect ratio",
            formatExists: "This format already exists",
            formatSaved: "Format saved",
            formatRenamed: "Format renamed",
            editOrder: "Rearrange and delete buttons",
            editButtons: "Edit buttons",
            helpTitle: "How to use",
            help: [
                "Click a preset to apply it; hover shows only what will change.",
                "The document icon marks presets with saved prompts. Preset prompts controls whether that text replaces the current prompts or goes at the start or end.",
                "Open Edit buttons in Manage presets to reorder buttons or use the red trash icon to delete a preset, size or custom format.",
                "Collapsed panel keeps your first 3 presets and first 3 formats.",
                "W ↔ H locks the aspect ratio, ×64 snaps sizes to multiples of 64.",
                "Seed is saved as-is (-1 = random); Hires. fix is stored as a whole block. Re-save a preset to capture them.",
            ],
        },
    };

    function t(key) {
        return i18n.en[key] ?? key;
    }

    function roundDimension(value, tab) {
        const step = state.snap64[tab] ? 64 : 8;
        return Math.max(step, Math.round(Number(value) / step) * step);
    }

    function setSize(tab, width, height) {
        const ids = controlIds[tab];
        if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
        const w = roundDimension(width, tab);
        const h = roundDimension(height, tab);
        state.dimensionSync = true;
        const okW = setSimpleValue(ids.width, w);
        const okH = setSimpleValue(ids.height, h);
        state.dimensionSync = false;
        if (state.dimensionLinks[tab]?.enabled && h > 0) {
            state.dimensionLinks[tab].ratio = w / h;
        }
        return okW || okH;
    }

    function adjustSize(tab, factor) {
        const size = readCurrentSize(tab);
        if (!size) {
            toast(t("sizeMissing"), true);
            return;
        }
        factor = Number(factor);
        if (!Number.isFinite(factor) || factor <= 0) return;
        setSize(tab, size.width * factor, size.height * factor);
        updatePreview(tab);
    }

    function toggleSnap64(tab) {
        state.snap64[tab] = !state.snap64[tab];
        localStorage.setItem(`masterPresets.snap64.${tab}`, state.snap64[tab] ? "1" : "0");
        if (state.snap64[tab]) {
            const size = readCurrentSize(tab);
            if (size) setSize(tab, size.width, size.height);
        }
        const panel = getRoot(`${UI_ID}-${tab}`);
        if (panel) updateLabels(panel);
        updatePreview(tab);
    }

    function applyAspectRatio(tab, ratioWidth, ratioHeight) {
        const size = readCurrentSize(tab);
        if (!size) {
            toast(t("sizeMissing"), true);
            return;
        }
        const ratio = Number(ratioWidth) / Number(ratioHeight);
        if (!Number.isFinite(ratio) || ratio <= 0) return;
        const area = Math.max(1, size.width * size.height);
        const width = Math.sqrt(area * ratio);
        const height = Math.sqrt(area / ratio);
        setSize(tab, width, height);
        if (state.dimensionLinks[tab]?.enabled) {
            const applied = readCurrentSize(tab);
            if (applied?.height) state.dimensionLinks[tab].ratio = applied.width / applied.height;
        }
        updatePreview(tab);
    }

    function toggleDimensionLink(tab) {
        const link = state.dimensionLinks[tab];
        if (!link) return;
        if (!link.enabled) {
            const size = readCurrentSize(tab);
            if (!size || !size.height) {
                toast(t("sizeMissing"), true);
                return;
            }
            link.ratio = size.width / size.height;
            link.enabled = true;
        } else {
            link.enabled = false;
        }
        const panel = getRoot(`${UI_ID}-${tab}`);
        if (panel) updateLabels(panel);
    }

    // Link (W<->H) and x64 handling used to attach listeners to the width/height
    // input elements found at mount time. Gradio re-creates those inputs (e.g. when
    // a UI preset change resets the sliders), which silently killed the listeners.
    // All width/height reactions therefore run through one document-level delegated
    // handler that survives any Gradio re-render.
    function installGlobalDelegation() {
        if (window.__mpGlobalDelegated) return;
        window.__mpGlobalDelegated = true;
        const handler = (event) => {
            const node = event.target;
            if (!node || typeof node.closest !== "function") return;
            for (const tab of ["txt2img", "img2img"]) {
                const ids = controlIds[tab];
                const isWidth = !!node.closest(`#${ids.width}`);
                const isHeight = !!node.closest(`#${ids.height}`);
                if (!isWidth && !isHeight) continue;

                updatePreview(tab);

                if (event.type === "input") {
                    const link = state.dimensionLinks[tab];
                    if (link?.enabled && Number.isFinite(link.ratio) && link.ratio > 0 && !state.dimensionSync) {
                        // This capture handler runs BEFORE Gradio syncs the sibling
                        // input (number <-> range), so the other side is stale by one
                        // input event. The event target always holds the fresh value.
                        const changed = Number(node.value);
                        if (Number.isFinite(changed) && changed > 0) {
                            state.dimensionSync = true;
                            if (isWidth) setSimpleValue(ids.height, roundDimension(changed / link.ratio, tab));
                            else setSimpleValue(ids.width, roundDimension(changed * link.ratio, tab));
                            state.dimensionSync = false;
                        }
                    }
                } else if (event.type === "change" && state.snap64[tab] && !state.dimensionSync) {
                    const size = readCurrentSize(tab);
                    if (size) setSize(tab, size.width, size.height);
                }
                return;
            }
        };
        document.addEventListener("input", handler, true);
        document.addEventListener("change", handler, true);
    }

    function normalizeQuickDimension(item) {
        if (!item || typeof item !== "object") return null;
        const width = Number(item.width);
        const height = Number(item.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
        const label = normalizeText(item.label) || `${width}×${height}`;
        return { label, width, height };
    }

    function uniqueQuickDimensions(items) {
        const out = [];
        const seen = new Set();
        for (const raw of items || []) {
            const item = normalizeQuickDimension(raw);
            if (!item) continue;
            const key = `${item.width}x${item.height}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
            if (out.length >= MAX_QUICK_DIMENSIONS) break;
        }
        return out;
    }

    function readPreset(tab) {
        const ids = controlIds[tab];
        const global = controlIds.global;
        const panel = getRoot(`${UI_ID}-${tab}`);
        const savePrompts = panel?.querySelector('[data-role="save-prompts"]')?.checked ?? false;

        return {
            version: 2,
            model: {
                forgePreset: readValue(global.forgePreset),
                checkpoint: readValue(global.checkpoint),
                modules: readValue(global.modules, { multi: true }),
                dtype: readValue(global.dtype),
            },
            generation: {
                width: readValue(ids.width, { numeric: true }),
                height: readValue(ids.height, { numeric: true }),
                steps: readValue(ids.steps, { numeric: true }),
                cfg: readValue(ids.cfg, { numeric: true }),
                distilledCfg: readValue(ids.distilledCfg, { numeric: true }),
                sampler: readValue(ids.sampler),
                scheduler: readValue(ids.scheduler),
                styles: readValue(ids.styles, { multi: true }),
                seed: readValue(ids.seed, { numeric: true }),
            },
            hires: ids.hires ? {
                enabled: checkboxValue(ids.hires.enabled),
                upscaler: readValue(ids.hires.upscaler),
                steps: readValue(ids.hires.steps, { numeric: true }),
                denoise: readValue(ids.hires.denoise, { numeric: true }),
                scale: readValue(ids.hires.scale, { numeric: true }),
            } : null,
            prompts: savePrompts ? {
                positive: readValue(ids.prompt) ?? "",
                negative: readValue(ids.negativePrompt) ?? "",
            } : null,
            savedFrom: tab,
            updatedAt: new Date().toISOString(),
        };
    }

    function readPromptMode(tab) {
        const mode = localStorage.getItem(PROMPT_MODE_KEY_PREFIX + tab);
        return PROMPT_MODES.includes(mode) ? mode : "replace";
    }

    function mergePrompt(current, saved, mode) {
        if (mode === "replace") return saved;
        if (!saved.trim()) return current;
        if (!current.trim()) return saved;
        const [first, second] = mode === "prepend" ? [saved, current] : [current, saved];
        if (/\n[ \t]*$/.test(first) || /^[ \t]*\n/.test(second)) return first + second;
        const left = first.trimEnd();
        const right = second.trimStart();
        if (left.endsWith(",")) return left + " " + right.replace(/^,\s*/, "");
        if (right.startsWith(",")) return left + right;
        return left + ", " + right;
    }

    function promptChanges(prompts, tab, mode) {
        const ids = controlIds[tab];
        return [
            [ids.prompt, prompts.positive ?? ""],
            [ids.negativePrompt, prompts.negative ?? ""],
        ].map(([id, saved]) => {
            const current = readValue(id) ?? "";
            return { id, current, next: mergePrompt(current, String(saved), mode) };
        }).filter(({ current, next }) => current !== next);
    }

    async function applyPreset(name, tab) {
        const preset = state.presets[name];
        if (!preset || state.busy) return;
        state.busy = true;
        const promptMode = state.promptModes[tab];
        renderAll();

        const failed = [];
        try {
            const model = preset.model || {};
            const generation = preset.generation || {};
            const ids = controlIds[tab] || controlIds.txt2img;
            const global = controlIds.global;

            // Must be a real Gradio/Svelte option selection. Forge's change callback then
            // refreshes checkpoint/modules and resets the generation defaults for that UI preset.
            if (model.forgePreset && !optionMatches(dropdownValue(global.forgePreset), model.forgePreset)) {
                const ok = await pickDropdownOption(global.forgePreset, model.forgePreset, { timeoutMs: 6000 });
                if (!ok) throw new Error(t("unavailableUiPreset").replace("{name}", () => model.forgePreset));
                await waitForPresetSettle(model.forgePreset);
            }

            if (model.checkpoint && !optionMatches(dropdownValue(global.checkpoint), model.checkpoint)) {
                const ok = await pickDropdownOption(global.checkpoint, model.checkpoint, { timeoutMs: 10000 });
                if (!ok) throw new Error(t("unavailableCheckpoint").replace("{name}", () => model.checkpoint));
                await sleep(300);
            }
            state.selected = name;
            if (Array.isArray(model.modules)
                && !sameTokenSet(readValue(global.modules, { multi: true }), model.modules)) {
                const ok = await setMultiDropdown(global.modules, model.modules);
                if (!ok) {
                    const current = readValue(global.modules, { multi: true }) || [];
                    const missing = model.modules.filter((wanted) => !current.some((value) => optionMatches(value, wanted)));
                    failed.push(missing.length
                        ? t("unavailableModules").replace("{names}", () => missing.join(", "))
                        : t("modules"));
                }
            }
            if (model.dtype && !optionMatches(dropdownValue(global.dtype), model.dtype)) {
                const ok = await pickDropdownOption(global.dtype, model.dtype, { timeoutMs: 4000 });
                if (!ok) failed.push(t("dtype"));
            }

            setNumericIfChanged(ids.width, generation.width);
            setNumericIfChanged(ids.height, generation.height);
            setNumericIfChanged(ids.steps, generation.steps);
            setNumericIfChanged(ids.cfg, generation.cfg);
            setNumericIfChanged(ids.distilledCfg, generation.distilledCfg);

            if (generation.sampler && !optionMatches(dropdownValue(ids.sampler), generation.sampler)) {
                if (!(await pickDropdownOption(ids.sampler, generation.sampler, { timeoutMs: 5000 }))) {
                    failed.push(t("sampler"));
                }
            }
            if (generation.scheduler && !optionMatches(dropdownValue(ids.scheduler), generation.scheduler)) {
                if (!(await pickDropdownOption(ids.scheduler, generation.scheduler, { timeoutMs: 5000 }))) {
                    failed.push(t("scheduler"));
                }
            }
            if (Array.isArray(generation.styles) && generation.styles.length
                && !sameTokenSet(readValue(ids.styles, { multi: true }), generation.styles)) {
                await setMultiDropdown(ids.styles, generation.styles);
            }
            if (Number.isFinite(generation.seed)) {
                setNumericIfChanged(ids.seed, generation.seed);
            }
            const hires = preset.hires;
            if (hires && ids.hires) {
                if (typeof hires.enabled === "boolean" && checkboxValue(ids.hires.enabled) !== hires.enabled) {
                    setCheckbox(ids.hires.enabled, hires.enabled);
                }
                setNumericIfChanged(ids.hires.scale, hires.scale);
                setNumericIfChanged(ids.hires.steps, hires.steps);
                setNumericIfChanged(ids.hires.denoise, hires.denoise);
                if (hires.upscaler && !optionMatches(dropdownValue(ids.hires.upscaler), hires.upscaler)) {
                    if (!(await pickDropdownOption(ids.hires.upscaler, hires.upscaler, { timeoutMs: 5000 }))) {
                        failed.push(t("hrUpscaler"));
                    }
                }
            }
            if (preset.prompts) {
                for (const { id, next } of promptChanges(preset.prompts, tab, promptMode)) {
                    setSimpleValue(id, next);
                }
            }

            await sleep(300);
            const presetInput = getRoot(global.forgePreset)?.querySelector('input[role="listbox"]');
            const checkpointInput = getRoot(global.checkpoint)?.querySelector('input[role="listbox"]');
            if (model.forgePreset && !optionMatches(presetInput?.value, model.forgePreset)) failed.push("UI Preset");
            if (model.checkpoint && !optionMatches(checkpointInput?.value, model.checkpoint)) failed.push("Checkpoint");

            if (failed.length) {
                const unique = [...new Set(failed)];
                toast(t("applyWarn").replace("{detail}", () => unique.join(", ")), true);
                console.warn("[Master Presets] Apply verification failed:", unique);
            } else {
                toast(t("applied"));
            }
        } catch (error) {
            console.error("[Master Presets] apply failed", error);
            toast(`${t("applyFailed")}: ${error.message || error}`, true);
        } finally {
            state.busy = false;
            renderAll();
        }
    }

    function applyQuickDimension(tab, item) {
        if (!item) return;
        if (setSize(tab, item.width, item.height)) updatePreview(tab);
    }

    function applyBasePresetSize(tab) {
        const preset = state.selected ? state.presets[state.selected] : null;
        const width = preset?.generation?.width;
        const height = preset?.generation?.height;
        if (!Number.isFinite(width) || !Number.isFinite(height)) return;
        setSize(tab, width, height);
        updatePreview(tab);
    }

    function rotateCurrentSize(tab) {
        const size = readCurrentSize(tab);
        if (!size) {
            toast(t("sizeMissing"), true);
            return;
        }
        setSize(tab, size.height, size.width);
        updatePreview(tab);
    }

    function normalizedRatio(w, h) {
        const g = gcd(Math.round(w), Math.round(h));
        return `${Math.round(w / g)}:${Math.round(h / g)}`;
    }

    function saveAsFormat(tab) {
        const size = readCurrentSize(tab);
        if (!size) {
            toast(t("sizeMissing"), true);
            return;
        }
        const ratio = normalizedRatio(size.width, size.height);
        const panel = getRoot(`${UI_ID}-${tab}`);
        const nameInput = panel?.querySelector('[data-role="size-name"]');
        const label = normalizeText(nameInput?.value);
        if (state.formatOrder.includes(ratio)) {
            if (!label || DEFAULT_FORMAT_ORDER.includes(ratio)) {
                toast(t("formatExists"), true);
                return;
            }
            state.formatNames[ratio] = label;
            if (nameInput) nameInput.value = "";
            persist().then(() => { renderAll(); toast(t("formatRenamed")); });
            return;
        }
        state.formatOrder.push(ratio);
        if (label) state.formatNames[ratio] = label;
        if (nameInput) nameInput.value = "";
        persist().then(() => { renderAll(); toast(t("formatSaved")); });
    }

    function addCurrentSize(tab) {
        const size = readCurrentSize(tab);
        if (!size) {
            toast(t("sizeMissing"), true);
            return;
        }
        const panel = getRoot(`${UI_ID}-${tab}`);
        const nameInput = panel?.querySelector('[data-role="size-name"]');
        const customLabel = normalizeText(nameInput?.value);
        const label = customLabel || `${size.width}×${size.height}`;
        const key = `${size.width}x${size.height}`;
        const existingIndex = state.quickDimensions.findIndex((item) => `${item.width}x${item.height}` === key);
        if (existingIndex >= 0) {
            if (!customLabel) {
                toast(t("sizeExists"), true);
                return;
            }
            state.quickDimensions[existingIndex] = {
                ...state.quickDimensions[existingIndex],
                label,
            };
            if (nameInput) nameInput.value = "";
            persist().then(() => {
                renderAll();
                toast(t("sizeRenamed"));
            });
            return;
        }
        state.quickDimensions = uniqueQuickDimensions([
            ...state.quickDimensions,
            { label, width: size.width, height: size.height },
        ]);
        if (nameInput) nameInput.value = "";
        persist().then(() => {
            renderAll();
            toast(t("sizeAdded"));
        });
    }

    function removeQuickDimension(key) {
        state.quickDimensions = state.quickDimensions.filter((entry) => `${entry.width}x${entry.height}` !== key);
        persist().then(() => {
            renderAll();
            toast(t("sizeRemoved"));
        });
    }

    const DEFAULT_FORMAT_ORDER = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"];

    function applyOrders(presetOrder, formatOrder) {
        if (Array.isArray(presetOrder)) state.presetOrder = presetOrder.filter((n) => typeof n === "string");
        if (Array.isArray(formatOrder) && formatOrder.length) {
            // Custom ratios (saveAsFormat) live here too: keep any well-formed
            // entry. Filtering to built-ins used to erase custom formats on
            // every page load.
            const filtered = [...new Set(formatOrder.filter((f) => typeof f === "string" && f))];
            for (const f of DEFAULT_FORMAT_ORDER) if (!filtered.includes(f)) filtered.push(f);
            state.formatOrder = filtered;
        }
    }

    async function loadData() {
        try {
            const response = await fetch(API, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            state.presets = data?.presets && typeof data.presets === "object" ? data.presets : {};
            state.quickDimensions = uniqueQuickDimensions(data?.quickDimensions || []);
            state.formatNames = data?.formatNames && typeof data.formatNames === "object" ? data.formatNames : {};
            applyOrders(data?.presetOrder, data?.formatOrder);
        } catch (error) {
            console.warn("[Master Presets] Backend storage unavailable; using browser fallback.", error);
            try {
                const fallback = JSON.parse(localStorage.getItem("masterPresets.fallback") || "{}");
                state.presets = fallback?.presets && typeof fallback.presets === "object" ? fallback.presets : (fallback || {});
                state.quickDimensions = uniqueQuickDimensions(fallback?.quickDimensions || []);
                applyOrders(fallback?.presetOrder, fallback?.formatOrder);
            } catch (_) {
                state.presets = {};
                state.quickDimensions = [];
            }
        }
    }

    async function persist() {
        const payload = {
            version: 2,
            presets: state.presets,
            quickDimensions: state.quickDimensions,
            presetOrder: state.presetOrder,
            formatOrder: state.formatOrder,
            formatNames: state.formatNames,
        };
        localStorage.setItem("masterPresets.fallback", JSON.stringify(payload));
        try {
            const response = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return true;
        } catch (error) {
            console.error("[Master Presets] Save failed.", error);
            toast(t("failed"), true);
            return false;
        }
    }

    async function saveCurrent(tab) {
        const panel = getRoot(`${UI_ID}-${tab}`);
        const input = panel?.querySelector('[data-role="preset-name"]');
        const name = normalizeText(input?.value);
        if (!name) {
            toast(t("missingName"), true);
            input?.focus();
            return;
        }

        if (state.presets[name] && !window.confirm(t("overwrite"))) return;

        const existing = state.presets[name] || {};
        state.presets[name] = {
            ...readPreset(tab),
            createdAt: existing.createdAt || new Date().toISOString(),
        };
        if (!state.presetOrder.includes(name)) state.presetOrder.push(name);
        state.selected = name;
        await persist();
        if (input) input.value = "";
        renderAll();
        toast(t("saved"));
    }

    async function deletePreset(name) {
        if (!name || !state.presets[name] || state.busy) return;
        if (!window.confirm(t("confirmDelete").replace("{name}", name))) return;
        delete state.presets[name];
        state.presetOrder = state.presetOrder.filter((n) => n !== name);
        if (state.selected === name) state.selected = null;
        await persist();
        renderAll();
        toast(t("deleted"));
    }

    function exportPresets() {
        const blob = new Blob([
            JSON.stringify({
                version: 2,
                presets: state.presets,
                quickDimensions: state.quickDimensions,
                presetOrder: state.presetOrder,
                formatOrder: state.formatOrder,
                formatNames: state.formatNames,
            }, null, 2),
        ], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `master-presets-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function importPresets(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(String(reader.result || ""));
                if (!data || typeof data.presets !== "object" || Array.isArray(data.presets)) {
                    throw new Error("Invalid data");
                }
                state.presets = { ...state.presets, ...data.presets };
                for (const imported of Object.keys(data.presets)) {
                    if (!state.presetOrder.includes(imported)) state.presetOrder.push(imported);
                }
                state.quickDimensions = uniqueQuickDimensions([
                    ...state.quickDimensions,
                    ...(Array.isArray(data.quickDimensions) ? data.quickDimensions : []),
                ]);
                // Orders and format names travel with the export:
                // the imported layout leads, local-only entries follow, so an
                // import restores the source layout without hiding anything
                // that exists only here.
                if (Array.isArray(data.presetOrder)) {
                    state.presetOrder = [...new Set([
                        ...data.presetOrder.filter((n) => typeof n === "string" && state.presets[n]),
                        ...state.presetOrder,
                    ])];
                }
                if (Array.isArray(data.formatOrder) && data.formatOrder.length) {
                    state.formatOrder = [...new Set([
                        ...data.formatOrder.filter((f) => typeof f === "string" && f),
                        ...state.formatOrder,
                    ])];
                }
                for (const f of DEFAULT_FORMAT_ORDER) {
                    if (!state.formatOrder.includes(f)) state.formatOrder.push(f);
                }
                if (data.formatNames && typeof data.formatNames === "object") {
                    state.formatNames = { ...state.formatNames, ...data.formatNames };
                }
                await persist();
                renderAll();
                toast(t("imported"));
            } catch (_) {
                toast(t("importError"), true);
            }
        };
        reader.readAsText(file);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function chip(label, value, tone = "") {
        if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "";
        const display = Array.isArray(value) ? value.join(", ") : value;
        return `<span class="mp-chip ${tone}"><b>${escapeHtml(label)}</b> ${escapeHtml(display)}</span>`;
    }

    // Panels are built once; their [data-role] elements never move. Resolve them a
    // single time instead of querying on every render.
    const panelRefs = new WeakMap();

    function refs(panel) {
        let map = panelRefs.get(panel);
        if (!map) {
            map = {};
            for (const el of panel.querySelectorAll("[data-role]")) map[el.dataset.role] = el;
            panelRefs.set(panel, map);
        }
        return map;
    }

    // Diff-on-hover: compare a preset against the CURRENT UI of this tab and list
    // only what applying it would change. Read-only; the apply flow is untouched.
    function presetDiff(name, tab) {
        const preset = state.presets[name];
        if (!preset) return [];
        const ids = controlIds[tab] || controlIds.txt2img;
        const glob = controlIds.global;
        const m = preset.model || {};
        const g = preset.generation || {};
        const diff = [];
        const push = (label, from, to) => diff.push({ label, from, to });

        if (m.forgePreset) {
            const cur = readValue(glob.forgePreset);
            if (!optionMatches(cur, m.forgePreset)) push(t("forgePreset"), cur, m.forgePreset);
        }
        if (m.checkpoint) {
            const cur = readValue(glob.checkpoint);
            if (!optionMatches(cur, m.checkpoint)) push(t("checkpoint"), cur, m.checkpoint);
        }
        if (Array.isArray(m.modules)) {
            const cur = readValue(glob.modules, { multi: true });
            if (!sameTokenSet(cur, m.modules)) {
                push(t("modules"), (cur || []).join(", ") || t("noModules"), m.modules.join(", "));
            }
        }
        if (m.dtype) {
            const cur = readValue(glob.dtype);
            if (!optionMatches(cur, m.dtype)) push(t("dtype"), cur, m.dtype);
        }
        const width = readValue(ids.width, { numeric: true });
        const height = readValue(ids.height, { numeric: true });
        if (Number.isFinite(width) && Number.isFinite(height) && (width !== g.width || height !== g.height)) {
            push(t("size"), `${width}×${height}`, `${g.width}×${g.height}`);
        }
        const numeric = (label, key, id) => {
            if (!Number.isFinite(g[key])) return;
            const cur = readValue(id, { numeric: true });
            if (cur !== g[key]) push(label, cur, g[key]);
        };
        numeric(t("steps"), "steps", ids.steps);
        numeric(t("cfg"), "cfg", ids.cfg);
        numeric(t("distilled"), "distilledCfg", ids.distilledCfg);
        if (g.sampler) {
            const cur = readValue(ids.sampler);
            if (!optionMatches(cur, g.sampler)) push(t("sampler"), cur, g.sampler);
        }
        if (g.scheduler) {
            const cur = readValue(ids.scheduler);
            if (!optionMatches(cur, g.scheduler)) push(t("scheduler"), cur, g.scheduler);
        }
        if (Array.isArray(g.styles)) {
            const cur = readValue(ids.styles, { multi: true });
            if (!sameTokenSet(cur, g.styles)) {
                push(t("styles"), (cur || []).join(", ") || "—", g.styles.join(", "));
            }
        }
        const seed = readValue(ids.seed, { numeric: true });
        if (Number.isFinite(seed) && Number.isFinite(g.seed) && seed !== g.seed) {
            push(t("seed"), seed, g.seed);
        }
        if (preset.hires && ids.hires && typeof preset.hires.enabled === "boolean") {
            const curOn = checkboxValue(ids.hires.enabled);
            if (curOn !== preset.hires.enabled) {
                push(t("hires"), curOn ? t("on") : t("off"), preset.hires.enabled ? t("on") : t("off"));
            } else if (preset.hires.enabled && curOn) {
                const hr = preset.hires;
                const hnum = (label, key, id) => {
                    if (!Number.isFinite(hr[key])) return;
                    const cur = readValue(id, { numeric: true });
                    if (cur !== hr[key]) push(label, cur, hr[key]);
                };
                hnum(t("hrScale"), "scale", ids.hires.scale);
                hnum(t("hrSteps"), "steps", ids.hires.steps);
                hnum(t("hrDenoise"), "denoise", ids.hires.denoise);
                const up = readValue(ids.hires.upscaler);
                if (hr.upscaler && !optionMatches(up, hr.upscaler)) push(t("hrUpscaler"), up, hr.upscaler);
            }
        }
        const mode = state.promptModes[tab];
        if (preset.prompts && promptChanges(preset.prompts, tab, mode).length) {
            const description = { replace: "diffReplace", prepend: "diffPrepend", append: "diffAppend" };
            push(t("presetPrompts"), "", t(description[mode]));
        }
        return diff;
    }

    // The card is hover-driven: it shows details only while the pointer rests on a
    // preset button (diff for other presets; the selected one shows full settings
    // while they match the live UI, the same diff once they drift) and stays hidden
    // otherwise — nothing is pinned open.
    let hoveredPresetName = null;

    function diffCardHTML(panel, name) {
        const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
        const diff = presetDiff(name, panel.dataset.tab);
        return diff.length
            ? diff.map((d) => `<span class="mp-chip mp-chip-diff"><b>${escapeHtml(d.label)}</b> `
                + `${d.from ? escapeHtml(fmt(d.from)) + " → " : ""}${escapeHtml(fmt(d.to))}</span>`).join("")
            : `<span class="mp-chip mp-chip-same">${escapeHtml(t("diffSame"))}</span>`;
    }

    function fullCardHTML(preset) {
        const m = preset.model || {};
        const g = preset.generation || {};
        const h = preset.hires;
        return [
            chip(t("forgePreset"), m.forgePreset),
            chip(t("checkpoint"), m.checkpoint),
            chip(t("modules"), Array.isArray(m.modules) && m.modules.length ? m.modules : t("noModules")),
            chip(t("dtype"), m.dtype),
            chip(t("size"), g.width && g.height ? `${g.width} × ${g.height}` : ""),
            chip(t("steps"), g.steps),
            chip(t("cfg"), g.cfg),
            chip(t("distilled"), g.distilledCfg),
            chip(t("sampler"), g.sampler),
            chip(t("scheduler"), g.scheduler),
            chip(t("styles"), g.styles),
            chip(t("seed"), Number.isFinite(g.seed) ? g.seed : ""),
            h ? chip(t("hires"), h.enabled
                ? `${h.upscaler || "—"} · ×${h.scale ?? "—"} · ${h.steps ?? 0}st · dn ${h.denoise ?? "—"}`
                : t("off")) : "",
        ].join("");
    }

    function renderCard(panel) {
        const card = refs(panel).card;
        if (!card) return;
        const name = hoveredPresetName;
        const preset = name ? state.presets[name] : null;
        if (!preset) {
            card.replaceChildren();
            card.hidden = true;
            return;
        }

        card.hidden = false;
        // The selected preset follows the live UI too: once the current setup has
        // drifted from it (e.g. the UI Preset was switched in Forge), the card shows
        // the same was → will be diff until the settings match again.
        card.innerHTML = name !== state.selected || presetDiff(name, panel.dataset.tab).length
            ? diffCardHTML(panel, name)
            : fullCardHTML(preset);
    }

    // The collapsed bar mirrors the panel rules: diff for other presets, full
    // settings for the selected one, card drops below the hovered button.
    function renderBarCard(panel, button) {
        const card = refs(panel)["bar-card"];
        if (!card) return;
        const name = hoveredPresetName;
        const preset = name ? state.presets[name] : null;
        if (!preset || !panel.classList.contains("is-collapsed")) {
            card.innerHTML = "";
            card.hidden = true;
            return;
        }
        card.hidden = false;
        card.innerHTML = name !== state.selected || presetDiff(name, panel.dataset.tab).length
            ? diffCardHTML(panel, name)
            : fullCardHTML(preset);
        const header = card.parentElement;
        const left = Math.min(button.offsetLeft, header.clientWidth - card.offsetWidth - 4);
        card.style.left = Math.max(0, left) + "px";
    }

    function orderedPresetNames() {
        const names = Object.keys(state.presets);
        const ordered = state.presetOrder.filter((n) => names.includes(n));
        const rest = names.filter((n) => !ordered.includes(n))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        return [...ordered, ...rest];
    }

    function isEditing(panel) {
        return panel.classList.contains("is-editing");
    }

    // In edit mode an item click must NOT activate (apply) the preset, size
    // or format: a stray click or a failed drag used to trigger applyPreset,
    // whose renderAll rebuilt the drag targets mid-gesture and killed the
    // drag. Trash buttons keep working; outside edit mode nothing changes.
    function preventEditActivation(panel, event) {
        if (!isEditing(panel)) return false;
        const target = event.target;
        if (!target || typeof target.closest !== "function") return false;
        if (!target.closest(".mp-edit-item")) return false;
        if (target.closest(".mp-edit-trash")) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
    }

    function wrapDraggable(button, type, key, withTrash) {
        const wrap = document.createElement("span");
        wrap.className = "mp-edit-item";
        wrap.draggable = true;
        // draggable is set on the button itself so the reorder gesture can
        // start directly on the button, not only on the wrapper around it.
        button.draggable = true;
        wrap.dataset.dragType = type;
        wrap.dataset.dragKey = key;
        wrap.appendChild(button);
        if (withTrash) {
            const trash = document.createElement("button");
            trash.type = "button";
            trash.className = "mp-edit-trash";
            trash.innerHTML = TRASH_ICON;
            const label = t("deleteItem").replace("{name}", () => button.textContent || key);
            trash.title = label;
            trash.setAttribute("aria-label", label);
            trash.dataset.trashType = type;
            trash.dataset.trashKey = key;
            wrap.appendChild(trash);
        }
        return wrap;
    }

    function ratioDims(ratio) {
        const parts = ratio.split(":");
        const w = Number(parts[0]);
        const h = Number(parts[1]);
        return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : { w: 1, h: 1 };
    }

    function renderFormats(panel) {
        const box = refs(panel)["aspect-list"];
        if (!box) return;
        box.replaceChildren();
        for (const ratio of state.formatOrder) {
            const { w, h } = ratioDims(ratio);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "mp-secondary mp-ratio-button";
            button.dataset.ratioW = w;
            button.dataset.ratioH = h;
            const shape = document.createElement("span");
            shape.className = "mp-ratio-shape";
            button.appendChild(shape);
            button.appendChild(document.createTextNode(state.formatNames[ratio] || ratio));
            const custom = !DEFAULT_FORMAT_ORDER.includes(ratio);
            box.appendChild(isEditing(panel) ? wrapDraggable(button, "formats", ratio, custom) : button);
        }
        renderRatioShapes(panel);
    }

    function createPresetButton(name) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mp-preset-button${name === state.selected ? " active" : ""}`;
        button.textContent = name;
        button.disabled = state.busy;
        button.dataset.presetName = name;
        const prompts = state.presets[name].prompts;
        if (prompts) {
            const positive = Boolean(String(prompts.positive ?? "").trim());
            const negative = Boolean(String(prompts.negative ?? "").trim());
            const label = t(positive && negative ? "savedBoth" : positive ? "savedPositive" : negative ? "savedNegative" : "savedEmpty");
            const icon = document.createElement("span");
            icon.className = "mp-prompt-icon";
            icon.title = label;
            icon.innerHTML = PROMPT_ICON;
            button.setAttribute("aria-label", `${name} — ${label}`);
            button.appendChild(icon);
        }
        return button;
    }

    function renderCollapsedBar(panel) {
        const bar = refs(panel)["collapsed-bar"];
        if (!bar) return;
        bar.replaceChildren();
        const editing = isEditing(panel);
        for (const name of orderedPresetNames().slice(0, 3)) {
            const button = createPresetButton(name);
            bar.appendChild(editing ? wrapDraggable(button, "presets", name, false) : button);
        }
        for (const ratio of state.formatOrder.slice(0, 3)) {
            const { w, h } = ratioDims(ratio);
            const b = document.createElement("button");
            b.type = "button";
            b.className = "mp-secondary mp-ratio-button";
            b.dataset.ratioW = w;
            b.dataset.ratioH = h;
            const shape = document.createElement("span");
            shape.className = "mp-ratio-shape";
            b.appendChild(shape);
            b.appendChild(document.createTextNode(ratio));
            bar.appendChild(editing ? wrapDraggable(b, "formats", ratio, false) : b);
        }
    }

    function moveKey(array, key, targetKey) {
        const from = array.indexOf(key);
        if (from < 0) return array;
        const copy = array.slice();
        copy.splice(from, 1);
        if (targetKey == null) {
            copy.push(key);
            return copy;
        }
        const to = copy.indexOf(targetKey);
        if (to < 0) return array;
        // Dropping onto an item: moving right lands AFTER it, moving left
        // lands BEFORE it — the dropped item takes the target's slot either
        // way. (The target index is read after the removal: comparing the
        // original positions tells the drag direction.)
        const forward = from < array.indexOf(targetKey);
        copy.splice(forward ? to + 1 : to, 0, key);
        return copy;
    }

    function handleDrop(panel, targetItem) {
        const drag = state.drag;
        if (!drag || !targetItem || targetItem.dataset.dragType !== drag.type) return;
        const targetKey = targetItem.dataset.dragKey;
        if (drag.type === "presets") {
            const base = orderedPresetNames();
            const next = moveKey(base.includes(drag.key) ? base : [...base, drag.key], drag.key, targetKey);
            state.presetOrder = next;
        } else if (drag.type === "sizes") {
            state.quickDimensions = moveKey(
                state.quickDimensions.map((i) => `${i.width}x${i.height}`),
                drag.key,
                targetKey
            ).map((key) => state.quickDimensions.find((i) => `${i.width}x${i.height}` === key));
        } else if (drag.type === "formats") {
            state.formatOrder = moveKey(state.formatOrder, drag.key, targetKey);
        }
        // The reorder must be visible before the persistence request finishes
        // (a slow or hung save must not freeze the UI).
        renderAll();
        persist();
    }

    function renderButtons(panel) {
        const box = refs(panel)["preset-buttons"];
        if (!box) return;
        box.replaceChildren();

        const names = orderedPresetNames();
        if (!names.length) {
            const empty = document.createElement("span");
            empty.className = "mp-muted";
            empty.textContent = t("empty");
            box.appendChild(empty);
            return;
        }

        const editing = isEditing(panel);
        for (const name of names) {
            const button = createPresetButton(name);
            box.appendChild(editing ? wrapDraggable(button, "presets", name, true) : button);
        }
    }

    function renderQuickDimensions(panel) {
        const box = refs(panel)["quick-dimensions"];
        if (!box) return;
        box.replaceChildren();
        const editing = isEditing(panel);

        if (!state.quickDimensions.length) {
            const empty = document.createElement("span");
            empty.className = "mp-muted";
            empty.textContent = t("emptySizes");
            box.appendChild(empty);
        } else {
            for (const item of state.quickDimensions) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "mp-size-button";
                button.textContent = item.label || `${item.width}×${item.height}`;
                button.dataset.sizeKey = `${item.width}x${item.height}`;
                box.appendChild(editing
                    ? wrapDraggable(button, "sizes", button.dataset.sizeKey, true)
                    : button);
            }
        }

        const baseButton = refs(panel)["qd-base"];
        const selectedPreset = state.selected ? state.presets[state.selected] : null;
        const hasPresetSize = Number.isFinite(selectedPreset?.generation?.width) && Number.isFinite(selectedPreset?.generation?.height);
        if (baseButton) {
            baseButton.hidden = !hasPresetSize;
            if (hasPresetSize) {
                baseButton.textContent = `${t("baseSize")} ${selectedPreset.generation.width}×${selectedPreset.generation.height}`;
                baseButton.title = t("tooltipBase");
            }
        }
    }

    function gcd(a, b) {
        a = Math.abs(a); b = Math.abs(b);
        while (b) { const t = b; b = a % b; a = t; }
        return a || 1;
    }

    const STD_RATIOS = [
        ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3],
        ["16:9", 16 / 9], ["9:16", 9 / 16], ["21:9", 21 / 9], ["2:1", 2], ["1:2", 0.5],
        ["5:4", 5 / 4], ["4:5", 4 / 5],
    ];

    const RATIO_NAMES = {
        en: {
            "1:1": "Square", "4:3": "Landscape", "3:4": "Portrait", "3:2": "Photo landscape",
            "2:3": "Photo portrait", "16:9": "Widescreen", "9:16": "Stories", "21:9": "Ultrawide",
        },
    };

    function ratioLabel(w, h) {
        if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return "";
        const r = w / h;
        let best = null;
        let bestDiff = Infinity;
        for (const entry of STD_RATIOS) {
            const d = Math.abs(entry[1] - r);
            if (d < bestDiff) { bestDiff = d; best = entry[0]; }
        }
        if (best && bestDiff / r < 0.04) return best;
        const g = gcd(Math.round(w), Math.round(h));
        return `${Math.round(w / g)}:${Math.round(h / g)}`;
    }

    // Preview updates are coalesced: sliders and delegated input events can fire
    // many times in a row. A timer (not requestAnimationFrame) is used on purpose —
    // rAF callbacks never run in background or occluded windows, which would leave
    // the preview permanently stale.
    const pendingPreview = { txt2img: null, img2img: null };

    function updatePreview(tab) {
        if (pendingPreview[tab] !== null) return;
        pendingPreview[tab] = window.setTimeout(() => {
            pendingPreview[tab] = null;
            const panel = getRoot(`${UI_ID}-${tab}`);
            if (!panel) return;
            const r = refs(panel);
            const shape = r["preview-shape"];
            const label = r["preview-label"];
            if (!shape || !label) return;
            const size = readCurrentSize(tab);
            if (!size) {
                shape.style.opacity = ".35";
                label.textContent = "—";
                return;
            }
            shape.style.opacity = "1";
            const maxW = 88;
            const maxH = 78;
            let bw;
            let bh;
            if (size.width >= size.height) {
                bw = maxW;
                bh = Math.round((maxW * size.height) / size.width);
                if (bh < 8) bh = 8;
            } else {
                bh = maxH;
                bw = Math.round((maxH * size.width) / size.height);
                if (bw < 8) bw = 8;
            }
            shape.style.width = bw + "px";
            shape.style.height = bh + "px";
            const mp = ((size.width * size.height) / 1e6).toFixed(2);
            label.textContent = `${size.width}×${size.height} · ${ratioLabel(size.width, size.height)} · ${mp} MP`;
        }, 40);
    }

    function renderRatioShapes(panel) {
        for (const btn of panel.querySelectorAll(".mp-ratio-button")) {
            const shape = btn.querySelector(".mp-ratio-shape");
            if (!shape) continue;
            const rw = Number(btn.dataset.ratioW) || 1;
            const rh = Number(btn.dataset.ratioH) || 1;
            const ratio = `${rw}:${rh}`;
            const max = 18;
            let w;
            let h;
            if (rw >= rh) {
                w = max;
                h = Math.max(5, Math.round((max * rh) / rw));
            } else {
                h = max;
                w = Math.max(5, Math.round((max * rw) / rh));
            }
            shape.style.width = w + "px";
            shape.style.height = h + "px";

            const name = RATIO_NAMES.en[ratio] || ratio;
            let tooltip = btn.querySelector(".mp-ratio-tooltip");
            if (!tooltip) {
                tooltip = document.createElement("span");
                tooltip.className = "mp-ratio-tooltip";
                btn.appendChild(tooltip);
            }
            tooltip.innerHTML = `<span>${escapeHtml(name)}</span><b>${escapeHtml(ratio)}</b>`;
            btn.setAttribute("aria-label", `${name} ${ratio}`);
            btn.removeAttribute("title");
        }
    }

    function updateLabels(panel) {
        const r = refs(panel);
        r.title.textContent = t("title");
        r["preset-title"].textContent = t("title");
        r["preset-name"].placeholder = t("name");
        r.save.textContent = t("save");
        r.save.title = t("tooltipSave");
        r["prompt-text"].textContent = t("prompts");
        r.export.textContent = t("export");
        r.export.title = t("tooltipExport");
        r["import-button"].textContent = t("import");
        r["import-button"].title = t("tooltipImport");
        r["manage-summary"].textContent = `💾 ${t("manage")}`;
        r["add-current-size"].textContent = t("addSize");
        r["save-as-format"].textContent = t("saveAsFormat");
        r["save-as-format"].title = t("tooltipSaveAsFormat");
        r["add-current-size"].title = t("tooltipAddSize");
        r["quick-title"].textContent = t("quickSizes");
        r["qd-rotate"].textContent = t("rotate");
        r["qd-rotate"].title = t("tooltipRotate");
        r["preview-title"].textContent = t("preview");
        r["aspect-title"].textContent = t("aspectRatios");
        r["transform-title"].textContent = t("transform");
        r["size-name"].placeholder = t("sizeName");
        const linkState = state.dimensionLinks[panel.dataset.tab];
        r["qd-link"].textContent = linkState?.enabled ? `🔒 ${t("linkSize")}` : `🔓 ${t("linkSize")}`;
        r["qd-link"].title = t("tooltipLink");
        r["qd-link"].classList.toggle("active", Boolean(linkState?.enabled));
        r["qd-snap64"].textContent = state.snap64[panel.dataset.tab] ? `🔒 ${t("snap64")}` : t("snap64");
        r["qd-snap64"].title = t("tooltipSnap64");
        r["qd-snap64"].classList.toggle("active", Boolean(state.snap64[panel.dataset.tab]));
        r["qd-scale05"].textContent = t("scale05");
        r["qd-scale075"].textContent = t("scale075");
        r["qd-scale15"].textContent = t("scale15");
        r["qd-scale20"].textContent = t("scale20");
        const collapsed = panel.classList.contains("is-collapsed");
        r.collapse.textContent = collapsed ? "▾" : "▴";
        r.collapse.title = collapsed ? t("expand") : t("collapse");
        r.collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
        r["edit-order"].textContent = `⠿ ${t("editButtons")}`;
        r["edit-order"].title = t("editOrder");
        r["edit-order"].classList.toggle("on", isEditing(panel));
        r["edit-order"].setAttribute("aria-pressed", isEditing(panel) ? "true" : "false");
        r.help.title = t("helpTitle");
        r["help-block"].innerHTML = (t("help") || []).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
    }

    function renderPromptMode(panel) {
        const r = refs(panel);
        const mode = state.promptModes[panel.dataset.tab];
        const hasPrompts = Object.values(state.presets).some((preset) => preset.prompts);
        r["prompt-mode-row"].hidden = !hasPrompts;
        r["bar-prompt-mode"].hidden = !hasPrompts;
        r["bar-prompt-mode"].value = mode;
        r["bar-prompt-mode"].disabled = state.busy;
        r["bar-prompt-mode"].title = `${t("presetPrompts")} · ${t(mode)}`;
        for (const button of r["prompt-mode-row"].querySelectorAll("[data-prompt-mode]")) {
            button.setAttribute("aria-pressed", String(button.dataset.promptMode === mode));
            button.disabled = state.busy;
        }
    }

    function renderPanel(panel) {
        updateLabels(panel);
        renderPromptMode(panel);
        renderButtons(panel);
        renderCard(panel);
        renderQuickDimensions(panel);
        renderFormats(panel);
        renderCollapsedBar(panel);
        renderRatioShapes(panel);
        updatePreview(panel.dataset.tab);
    }

    function renderAll() {
        for (const tab of ["txt2img", "img2img"]) {
            const panel = getRoot(`${UI_ID}-${tab}`);
            if (panel) renderPanel(panel);
        }
    }

    function createPanel(tab) {
        let dropHoverItem = null; // last .mp-edit-item the drag hovered (gap drops reuse it)
        const panel = document.createElement("section");
        panel.id = `${UI_ID}-${tab}`;
        panel.className = "master-presets-panel";
        panel.dataset.tab = tab;
        panel.innerHTML = `
            <div class="mp-header">
                <strong data-role="title"></strong>
                <div class="mp-collapsed-bar" data-role="collapsed-bar"></div>
                <div class="mp-card mp-bar-card" data-role="bar-card" hidden></div>
                <div class="mp-header-actions">
                    <select class="mp-bar-prompt-mode" data-role="bar-prompt-mode" aria-label="${t("presetPrompts")}">
                        ${PROMPT_MODES.map((mode) => `<option value="${mode}">${t(mode)}</option>`).join("")}
                    </select>
                    <button type="button" class="mp-secondary mp-help-toggle" data-role="help">?</button>
                    <button type="button" class="mp-collapse" data-role="collapse"></button>
                </div>
            </div>
            <div class="mp-help" data-role="help-block" hidden></div>
            <div class="mp-panel-body">
            <div class="mp-quick-actions mp-preset-row mp-control-row">
                <span class="mp-inline-label" data-role="preset-title"></span>
                <div class="mp-preset-buttons" data-role="preset-buttons"></div>
            </div>
            <div class="mp-quick-actions mp-control-row mp-prompt-mode-row" data-role="prompt-mode-row">
                <span class="mp-inline-label">${t("presetPrompts")}</span>
                <div class="mp-prompt-modes" role="group" aria-label="${t("presetPrompts")}">
                    ${PROMPT_MODES.map((mode) => `<button type="button" data-prompt-mode="${mode}">${t(mode)}</button>`).join("")}
                </div>
            </div>
            <div class="mp-card" data-role="card"></div>
            <div class="mp-quick-block">
                <div class="mp-quick-layout">
                    <div class="mp-quick-content">
                        <div class="mp-quick-actions mp-control-row">
                            <span class="mp-inline-label" data-role="quick-title"></span>
                            <div class="mp-quick-row" data-role="quick-dimensions"></div>
                        </div>
                        <div class="mp-quick-actions mp-aspect-tools mp-control-row">
                            <span class="mp-inline-label" data-role="aspect-title"></span>
                            <div class="mp-aspect-list" data-role="aspect-list" data-draglist="formats"></div>
                        </div>
                        <div class="mp-quick-actions mp-size-tools mp-control-row">
                            <span class="mp-inline-label" data-role="transform-title"></span>
                            <button type="button" class="mp-secondary" data-role="qd-base"></button>
                            <button type="button" class="mp-secondary" data-role="qd-rotate"></button>
                            <button type="button" class="mp-secondary mp-link-button" data-role="qd-link"></button>
                            <button type="button" class="mp-secondary mp-link-button" data-role="qd-snap64"></button>
                            <button type="button" class="mp-secondary" data-role="qd-scale05"></button>
                            <button type="button" class="mp-secondary" data-role="qd-scale075"></button>
                            <button type="button" class="mp-secondary" data-role="qd-scale15"></button>
                            <button type="button" class="mp-secondary" data-role="qd-scale20"></button>
                        </div>
                    </div>
                    <div class="mp-preview-card" data-role="preview">
                        <div class="mp-preview-stage"><span class="mp-preview-shape" data-role="preview-shape"></span></div>
                        <span class="mp-preview-label" data-role="preview-label"></span>
                        <span class="mp-preview-title" data-role="preview-title"></span>
                    </div>
                </div>
            </div>
            <details class="mp-manage">
                <summary data-role="manage-summary"></summary>
                <div class="mp-manage-stack">
                    <div class="mp-manage-main">
                        <input type="text" data-role="preset-name" class="mp-name" autocomplete="off">
                        <button type="button" data-role="save" class="mp-primary"></button>
                        <label class="mp-checkbox">
                            <input type="checkbox" data-role="save-prompts">
                            <span data-role="prompt-text"></span>
                        </label>
                    </div>
                    <div class="mp-manage-main mp-size-manager">
                        <input type="text" data-role="size-name" class="mp-size-name" autocomplete="off">
                        <button type="button" data-role="add-current-size" class="mp-secondary"></button>
                        <button type="button" data-role="save-as-format" class="mp-secondary"></button>
                    </div>
                    <div class="mp-manage-main">
                        <button type="button" class="mp-secondary mp-edit-toggle" data-role="edit-order" aria-pressed="false"></button>
                        <button type="button" data-role="export" class="mp-secondary"></button>
                        <button type="button" data-role="import-button" class="mp-secondary"></button>
                        <input type="file" data-role="import-file" accept="application/json,.json" hidden>
                    </div>
                </div>
            </details>
            </div>
        `;

        const r = refs(panel);
        function setPromptMode(mode) {
            state.promptModes[tab] = mode;
            localStorage.setItem(PROMPT_MODE_KEY_PREFIX + tab, mode);
            renderPromptMode(panel);
            renderCard(panel);
        }
        r["prompt-mode-row"].addEventListener("click", (event) => {
            const button = event.target.closest("[data-prompt-mode]");
            if (button) setPromptMode(button.dataset.promptMode);
        });
        r["bar-prompt-mode"].addEventListener("change", (event) => setPromptMode(event.target.value));

        panel.querySelector('[data-role="save"]').addEventListener("click", () => saveCurrent(tab));
        panel.querySelector('[data-role="export"]').addEventListener("click", exportPresets);
        panel.querySelector('[data-role="add-current-size"]').addEventListener("click", () => addCurrentSize(tab));
        panel.querySelector('[data-role="save-as-format"]').addEventListener("click", () => saveAsFormat(tab));
        panel.querySelector('[data-role="qd-base"]').addEventListener("click", () => applyBasePresetSize(tab));
        panel.querySelector('[data-role="qd-rotate"]').addEventListener("click", () => rotateCurrentSize(tab));
        panel.querySelector('[data-role="qd-link"]').addEventListener("click", () => toggleDimensionLink(tab));
        panel.querySelector('[data-role="qd-snap64"]').addEventListener("click", () => toggleSnap64(tab));
        panel.querySelector('[data-role="qd-scale05"]').addEventListener("click", () => adjustSize(tab, 0.5));
        panel.querySelector('[data-role="qd-scale075"]').addEventListener("click", () => adjustSize(tab, 0.75));
        panel.querySelector('[data-role="qd-scale15"]').addEventListener("click", () => adjustSize(tab, 1.5));
        panel.querySelector('[data-role="qd-scale20"]').addEventListener("click", () => adjustSize(tab, 2.0));
        panel.querySelector('[data-role="aspect-list"]').addEventListener("click", (event) => {
            if (preventEditActivation(panel, event)) return;
            const ratioButton = event.target.closest(".mp-ratio-button");
            if (!ratioButton) return;
            applyAspectRatio(tab, Number(ratioButton.dataset.ratioW), Number(ratioButton.dataset.ratioH));
        });
        refs(panel)["collapsed-bar"].addEventListener("click", (event) => {
            if (preventEditActivation(panel, event)) return;
            const preset = event.target.closest("[data-preset-name]");
            if (preset) {
                applyPreset(preset.dataset.presetName, tab);
                return;
            }
            const ratioButton = event.target.closest(".mp-ratio-button");
            if (ratioButton) {
                applyAspectRatio(tab, Number(ratioButton.dataset.ratioW), Number(ratioButton.dataset.ratioH));
            }
        });
        refs(panel)["edit-order"].addEventListener("click", () => {
            panel.classList.toggle("is-editing");
            renderAll();
        });
        refs(panel)["help"].addEventListener("click", () => {
            const block = refs(panel)["help-block"];
            block.hidden = !block.hidden;
        });
        panel.addEventListener("click", (event) => {
            const trash = event.target.closest("[data-trash-type]");
            if (!trash) return;
            event.stopPropagation();
            if (trash.dataset.trashType === "presets") deletePreset(trash.dataset.trashKey);
            else if (trash.dataset.trashType === "sizes") removeQuickDimension(trash.dataset.trashKey);
            else if (trash.dataset.trashType === "formats") {
                const ratio = trash.dataset.trashKey;
                state.formatOrder = state.formatOrder.filter((f) => f !== ratio);
                delete state.formatNames[ratio];
                persist().then(() => renderAll());
            }
        });
        panel.addEventListener("dragstart", (event) => {
            const item = event.target.closest && event.target.closest(".mp-edit-item");
            if (!item || !panel.classList.contains("is-editing")) return;
            state.drag = { type: item.dataset.dragType, key: item.dataset.dragKey };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", state.drag.key);
        });
        panel.addEventListener("dragover", (event) => {
            if (!state.drag) return;
            const item = event.target.closest(".mp-edit-item");
            if (item && item.dataset.dragType === state.drag.type) {
                event.preventDefault();
                dropHoverItem = item;
                panel.querySelectorAll(".mp-edit-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
                item.classList.add("drag-over");
                return;
            }
            // Gaps between and after the buttons (and the collapsed quick bar):
            // accept the drop there too — without preventDefault the browser
            // forbids it and drop never fires.
            const row = event.target.closest ? event.target.closest(".mp-preset-buttons, .mp-quick-row, .mp-aspect-list, .mp-collapsed-bar") : null;
            if (row) {
                event.preventDefault();
                panel.querySelectorAll(".mp-edit-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
            }
        });
        panel.addEventListener("drop", (event) => {
            if (!state.drag) return;
            let item = event.target.closest(".mp-edit-item");
            if ((!item || item.dataset.dragType !== state.drag.type) && dropHoverItem) {
                item = dropHoverItem; // the drop slipped off the button: use the last hovered item
            }
            if (!item) {
                const row = event.target.closest ? event.target.closest(".mp-preset-buttons, .mp-quick-row, .mp-aspect-list, .mp-collapsed-bar") : null;
                const items = row ? [...row.querySelectorAll(`.mp-edit-item[data-drag-type="${state.drag.type}"]`)] : [];
                item = items.length ? items[items.length - 1] : null; // gap drop: after the last item of this type
            }
            if (item && item.dataset.dragType === state.drag.type) {
                event.preventDefault();
                handleDrop(panel, item);
            }
            dropHoverItem = null;
            state.drag = null;
            panel.querySelectorAll(".mp-edit-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
        });
        panel.addEventListener("dragend", () => {
            dropHoverItem = null;
            state.drag = null;
            panel.querySelectorAll(".mp-edit-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
        });

        // Delegated clicks: preset buttons and quick sizes are re-rendered often,
        // so listeners live on their stable containers instead of each button.
        panel.querySelector('[data-role="preset-buttons"]').addEventListener("click", (event) => {
            if (preventEditActivation(panel, event)) return;
            const button = event.target.closest("[data-preset-name]");
            if (!button) return;
            applyPreset(button.dataset.presetName, tab);
        });
        // Hover details: armed on mouseover after a dwell delay, cleared on mouseout;
        // the card shows while hovering and hides otherwise (nothing stays pinned).
        const presetBox = panel.querySelector('[data-role="preset-buttons"]');
        presetBox.addEventListener("mouseover", (event) => {
            const button = event.target.closest("[data-preset-name]");
            if (!button || button._mpDiffArmed) return;
            button._mpDiffArmed = true;
            button._mpDiffTimer = window.setTimeout(() => {
                hoveredPresetName = button.dataset.presetName;
                renderCard(panel);
            }, DIFF_DELAY_MS);
        });
        presetBox.addEventListener("mouseout", (event) => {
            const button = event.target.closest("[data-preset-name]");
            if (!button) return;
            button._mpDiffArmed = false;
            window.clearTimeout(button._mpDiffTimer);
            hoveredPresetName = null;
            renderCard(panel);
        });
        const barBox = refs(panel)["collapsed-bar"];
        barBox.addEventListener("mouseover", (event) => {
            const button = event.target.closest("[data-preset-name]");
            if (!button || button._mpDiffArmed) return;
            button._mpDiffArmed = true;
            button._mpDiffTimer = window.setTimeout(() => {
                hoveredPresetName = button.dataset.presetName;
                renderCard(panel);
                renderBarCard(panel, button);
            }, DIFF_DELAY_MS);
        });
        barBox.addEventListener("mouseout", (event) => {
            const button = event.target.closest("[data-preset-name]");
            if (!button) return;
            button._mpDiffArmed = false;
            window.clearTimeout(button._mpDiffTimer);
            hoveredPresetName = null;
            renderCard(panel);
            renderBarCard(panel);
        });
        panel.querySelector('[data-role="quick-dimensions"]').addEventListener("click", (event) => {
            if (preventEditActivation(panel, event)) return;
            const button = event.target.closest("[data-size-key]");
            if (!button) return;
            const key = button.dataset.sizeKey;
            const item = state.quickDimensions.find((entry) => `${entry.width}x${entry.height}` === key);
            if (!item) return;
            applyQuickDimension(tab, item);
        });

        panel.querySelector('[data-role="collapse"]').addEventListener("click", () => {
            const collapsed = panel.classList.toggle("is-collapsed");
            localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${tab}`, collapsed ? "1" : "0");
            renderPanel(panel);
        });

        const fileInput = panel.querySelector('[data-role="import-file"]');
        panel.querySelector('[data-role="import-button"]').addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
            importPresets(fileInput.files?.[0]);
            fileInput.value = "";
        });

        if (localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${tab}`) === "1") {
            panel.classList.add("is-collapsed");
        }

        renderPanel(panel);
        return panel;
    }

    function mount(tab) {
        if (getRoot(`${UI_ID}-${tab}`)) return true;
        const target = getRoot(`${tab}_settings`) || getRoot(`${tab}_toprow`) || getRoot(tab);
        if (!target) return false;
        target.prepend(createPanel(tab));
        return true;
    }

    function toast(message, isError = false) {
        let node = document.getElementById("master-presets-toast");
        if (!node) {
            node = document.createElement("div");
            node.id = "master-presets-toast";
            node.setAttribute("role", "status");
            document.body.appendChild(node);
        }
        node.textContent = message;
        node.className = `mp-toast show${isError ? " error" : ""}`;
        window.clearTimeout(node._mpTimer);
        node._mpTimer = window.setTimeout(() => node.className = "mp-toast", isError ? 6500 : 1800);
    }

    async function init() {
        installGlobalDelegation();
        await loadData();
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            const a = mount("txt2img");
            const b = mount("img2img");
            if ((a && b) || attempts > 40) {
                window.clearInterval(timer);
            }
        }, 250);
    }

    if (typeof onUiLoaded === "function") {
        onUiLoaded(init);
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
