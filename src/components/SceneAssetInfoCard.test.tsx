import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SceneAssetInfoCard } from './SceneAssetInfoCard';
import { getSceneAssetInfo } from '../utils/sceneAssetInfo';
import { makeGridState } from '../test/fixtures';
import { applyCommand } from '../utils/gridReducer';
import { createInitialGridState } from '../utils/tickEngine';
import { COMPACT_LEGEND_QUERY } from './EnergyFlowLegend';
import indexCss from '../index.css?raw';

describe('SceneAssetInfoCard', () => {
    it('renders live BESS values for the selected asset', () => {
        const state = makeGridState({
            batteryMode: 'charging',
            batteryPowerMw: 102,
            batterySocPercent: 38.4,
            batteryChargeFromSolarMw: 90,
            batteryChargeFromGridMw: 12,
            batteryDischargeToLoadMw: 0, batteryDischargeToExportMw: 0,
        });

        render(
            <SceneAssetInfoCard
                assetId="bess"
                gridState={state}
                pinned
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByRole('region', { name: 'BESS Unit live information' })).toBeInTheDocument();
        expect(screen.getByText('Charging')).toBeInTheDocument();
        expect(screen.getByText('38.4%')).toBeInTheDocument();
        expect(screen.getByText('-102.0 MW')).toBeInTheDocument();
        expect(screen.getByText('Usable energy fill')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close equipment info card' })).toBeInTheDocument();
    });

    it('labels paused power as a snapshot and follows a zeroed sample after an edit', () => {
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'negative-price-charge',
        }, 1).next;
        const { rerender } = render(<SceneAssetInfoCard assetId="bess" gridState={preset} pinned onClose={vi.fn()} />);
        expect(screen.getByText('Paused snapshot')).toBeInTheDocument();
        expect(screen.getByText('Charging')).toBeInTheDocument();
        expect(screen.getByText('Manual charge')).toBeInTheDocument();
        expect(screen.getByText('-70.0 MW')).toBeInTheDocument();

        const edited = applyCommand(preset, { type: 'SET_BESS_POWER_RATING', payload: 120 }, 2).next;
        expect(edited.batteryMode).toBe('charging');
        rerender(<SceneAssetInfoCard assetId="bess" gridState={edited} pinned onClose={vi.fn()} />);
        expect(screen.getByText('Paused snapshot')).toBeInTheDocument();
        expect(screen.getByText('Idle')).toBeInTheDocument();
        expect(screen.queryByText('Charging')).not.toBeInTheDocument();
        expect(screen.getByText('Manual charge')).toBeInTheDocument();
        expect(screen.getByText(/time and earnings are frozen/)).toBeInTheDocument();
    });

    it('exposes PCS/MV throughput as a derived routed-flow value', () => {
        const info = getSceneAssetInfo('pcs-mv', makeGridState({
            solarOutputMw: 146,
            gridDemandMw: 40,
            solarExportMw: 72,
            solarCurtailedMw: 0,
            batteryChargeFromSolarMw: 34,
            batteryChargeFromGridMw: 11,
            batteryDischargeToLoadMw: 5,
            batteryDischargeToExportMw: 0,
            gridImportMw: 11,
        }));

        expect(info.title).toBe('PCS / MV Station');
        expect(info.primary).toEqual({ label: 'Gross routed flow', value: '162.0 MW' });
        expect(info.flowRows).toContainEqual({ label: 'PV to local load', value: '40.0 MW' });
        expect(info.flowRows).toContainEqual({ label: 'PV export to grid', value: '72.0 MW' });
        expect(info.flowRows).toContainEqual({ label: 'BESS charge path', value: '45.0 MW' });
    });

    it('frames the representative models as station-aggregate telemetry', () => {
        const bess = getSceneAssetInfo('bess', makeGridState({ batteryEnergyCapacityMwh: 744 }));
        expect(bess.description).toContain('station-level aggregates');
        expect(bess.rows).toContainEqual({ label: 'Model equivalence', value: '≈149 × 5 MWh container units' });

        const pcs = getSceneAssetInfo('pcs-mv', makeGridState({ gridBessConnectionMw: 186 }));
        // 186 MW interconnect / 5 MW representative skid → ≈38 equivalent units
        expect(pcs.description).toContain('station-level aggregates');
        expect(pcs.rows).toContainEqual({ label: 'Model equivalence', value: '≈38 × 5 MW skid units' });

        const grid = getSceneAssetInfo('grid-node', makeGridState());
        expect(grid.description).toContain('schematic stand-in');
    });

    it('caps card height to the viewport and allows vertical scroll', () => {
        // Guards the 720p clipping fix: the card can grow taller than a short
        // viewport (esp. the PCS card with its extra rows), so it must cap its
        // height and scroll rather than clip content off-screen. jsdom has no
        // layout engine, so assert the scroll affordance is wired on the container.
        render(
            <SceneAssetInfoCard
                assetId="pcs-mv"
                gridState={makeGridState()}
                pinned
                onClose={vi.fn()}
            />,
        );

        const card = screen.getByTestId('scene-asset-info-card');
        expect(card.className).toContain('overflow-y-auto');
        expect(card.className).toMatch(/max-h-\[/);
    });

    it('docks beside the default overview instead of over the site', () => {
        // Placement is CSS: a bottom sheet above the scene toolbar in portrait, and
        // top-right below the HUD and left of the Metrics handle in landscape.
        // index.css docks .scene-asset-card over the solar array in short
        // landscape. jsdom has no layout engine; the real-browser check in
        // docs/audits/2026-09-25/card-label-check.mjs measures the rectangles.
        render(<SceneAssetInfoCard assetId="bess" gridState={makeGridState()} pinned onClose={vi.fn()} />);

        const card = screen.getByTestId('scene-asset-info-card');
        expect(card).toHaveClass('scene-asset-card', 'bottom-24', 'left-1/2', 'landscape:top-[62px]', 'landscape:right-[70px]');
        expect(card.className).not.toMatch(/(^|\s)lg:/);
    });

    it('hides the SOLAR ARRAY tag behind a shown card only in short landscape', () => {
        // jsdom does not apply index.css; docs/audits/2026-10-03/compact-card-check.mjs
        // measures the tag in Chromium. This pins the rule to the compact query.
        const rule = /\.scene-viewport:has\(\.scene-asset-card\) \.scene-label-solar\s*\{\s*visibility: hidden;\s*\}/;
        const queries = [...indexCss.matchAll(/@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)]
            .filter(([, , body]) => rule.test(body))
            .map(([, query]) => query.trim());
        expect(queries).toEqual([COMPACT_LEGEND_QUERY]);
        expect(indexCss.match(/\.scene-label-solar/g)).toHaveLength(1);
    });

    it('keeps the Close name when a narrow card shows only a glyph', () => {
        render(<SceneAssetInfoCard assetId="pcs-mv" gridState={makeGridState()} pinned onClose={vi.fn()} />);

        const close = screen.getByRole('button', { name: 'Close equipment info card' });
        expect(close).toHaveTextContent('Close');
        expect(close.querySelector('[aria-hidden="true"]')).toHaveTextContent('×');
    });

    it('lets a hover preview pass pointer input through; a pinned card takes it', () => {
        // A preview can still open over equipment after the camera moves. If it
        // caught the pointer, hover would flicker and the click would miss.
        const { rerender } = render(
            <SceneAssetInfoCard assetId="grid-node" gridState={makeGridState()} pinned={false} onClose={vi.fn()} />,
        );
        const card = screen.getByTestId('scene-asset-info-card');
        expect(card).toHaveClass('pointer-events-none');
        expect(card).not.toHaveClass('pointer-events-auto');

        rerender(<SceneAssetInfoCard assetId="grid-node" gridState={makeGridState()} pinned onClose={vi.fn()} />);
        expect(card).toHaveClass('pointer-events-auto');
        expect(card).not.toHaveClass('pointer-events-none');
    });

    it('condenses the short-landscape card to a summary and folds the other readings', async () => {
        // Short landscape gives the docked card about 200px. The summary keeps the
        // headline reading, status, paused-snapshot reading, its note, the flows
        // and the station-level framing; Details holds the rest.
        const user = userEvent.setup();
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'negative-price-charge',
        }, 1).next;
        render(<SceneAssetInfoCard assetId="bess" gridState={preset} pinned compact onClose={vi.fn()} />);

        for (const text of ['BESS Unit', '24.0%', 'Paused snapshot', 'Sampled operation', 'Charging', '-70.0 MW', 'Station-level totals']) {
            expect(screen.getByText(text)).toBeVisible();
        }
        expect(screen.getByText(/time and earnings are frozen/)).toBeVisible();
        const details = screen.getByRole('button', { name: 'Details' });
        expect(details).toHaveAttribute('aria-expanded', 'false');
        const folded = document.getElementById(details.getAttribute('aria-controls')!)!;
        expect(folded).not.toBeVisible();
        expect(within(folded).getByText('Key readings')).toBeInTheDocument();
        expect(within(folded).getByText('Manual charge')).toBeInTheDocument();
        expect(within(folded).getByText(/station-level aggregates/)).toBeInTheDocument();
        // Each reading appears once: the summary row is not repeated in Details.
        expect(screen.getAllByText('Sampled operation')).toHaveLength(1);

        await user.click(details);
        expect(details).toHaveAttribute('aria-expanded', 'true');
        expect(folded).toBeVisible();
        expect(screen.getByText('Manual charge')).toBeVisible();
        expect(screen.getByText('Press Esc or click empty space to close')).toBeVisible();
    });

    it('keeps details open while the same equipment updates', async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <SceneAssetInfoCard assetId="grid-node" gridState={makeGridState({ gridDemandMw: 120 })} pinned compact onClose={vi.fn()} />,
        );
        await user.click(screen.getByRole('button', { name: 'Details' }));
        rerender(<SceneAssetInfoCard assetId="grid-node" gridState={makeGridState({ gridDemandMw: 135 })} pinned compact onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Key readings')).toBeVisible();
    });

    it('gives a short-landscape hover preview the summary and no control', () => {
        render(<SceneAssetInfoCard assetId="pcs-mv" gridState={makeGridState()} pinned={false} compact onClose={vi.fn()} />);

        const card = screen.getByTestId('scene-asset-info-card');
        expect(within(card).queryAllByRole('button')).toHaveLength(0);
        expect(card.querySelectorAll('button, a[href], input, [tabindex]')).toHaveLength(0);
        expect(screen.getByText('Gross routed flow')).toBeVisible();
        expect(screen.getByText('Click object to pin this card')).toBeVisible();
        expect(screen.queryByText('Key readings')).not.toBeInTheDocument();
    });

    it('shows every reading without a Details control outside short landscape', () => {
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'negative-price-charge',
        }, 1).next;
        render(<SceneAssetInfoCard assetId="bess" gridState={preset} pinned onClose={vi.fn()} />);

        expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
        expect(screen.getByText('Key readings')).toBeVisible();
        expect(screen.getByText('Sampled operation')).toBeVisible();
        expect(screen.getByText('Manual charge')).toBeVisible();
        expect(screen.queryByText('Station-level totals')).not.toBeInTheDocument();
    });

    it('calls onClose when the pinned card close button is clicked', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();

        render(
            <SceneAssetInfoCard
                assetId="grid-node"
                gridState={makeGridState()}
                pinned
                onClose={onClose}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Close equipment info card' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
