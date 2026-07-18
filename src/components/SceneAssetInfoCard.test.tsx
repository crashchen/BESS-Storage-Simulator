import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SceneAssetInfoCard } from './SceneAssetInfoCard';
import { getSceneAssetInfo } from '../utils/sceneAssetInfo';
import { makeGridState } from '../test/fixtures';

describe('SceneAssetInfoCard', () => {
    it('renders live BESS values for the selected asset', () => {
        const state = makeGridState({
            batteryMode: 'charging',
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
        const pcs = getSceneAssetInfo('pcs-mv', makeGridState({ gridBessConnectionMw: 186 }));
        // 186 MW interconnect / 5 MW representative skid → ≈38 equivalent units
        expect(pcs.description).toContain('station-level aggregates');
        expect(pcs.rows).toContainEqual({ label: 'Model equivalence', value: '≈38 × 5 MW skid units' });

        const grid = getSceneAssetInfo('grid-node', makeGridState());
        expect(grid.description).toContain('schematic stand-in');
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
