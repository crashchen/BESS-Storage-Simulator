import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ControlPanel } from './ControlPanel';
import { makeGridState } from '../test/fixtures';

describe('ControlPanel', () => {
    it('dispatches auto-arbitrage toggle from the control button', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await user.click(screen.getByRole('button', { name: /auto arb/i }));

        expect(onCommand).toHaveBeenCalledWith({ type: 'TOGGLE_AUTO_ARB' });
    });
});
