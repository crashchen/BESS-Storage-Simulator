"""Render curve.csv with matplotlib; no application dependencies are changed."""
from pathlib import Path
import csv
import os
import tempfile
os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'bess-lighting-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parent
with (root / 'curve.csv').open() as source:
    rows = [{key: float(value) for key, value in row.items()} for row in csv.DictReader(source)]
fig, axes = plt.subplots(3, 2, figsize=(11, 8), constrained_layout=True)
for row_index, face in enumerate(['front', 'top', 'rear']):
    for column, (label, start, end) in enumerate([('Dawn', 4, 8), ('Dusk', 16, 21)]):
        ax = axes[row_index, column]
        window = [row for row in rows if start <= row['hour'] <= end]
        ax.plot([row['hour'] for row in window], [row[f'candidate_{face}_proxy'] for row in window], color='#2563eb', lw=2.2, label='Corrected rig')
        ax.plot([row['hour'] for row in window], [row[f'legacy_{face}_proxy'] for row in window], color='#c96b27', lw=1.7, ls='--', label='Prior CC night rig')
        ax.axhline(rows[0][f'candidate_{face}_proxy'], color='#64748b', lw=1, ls=':', label='Corrected night baseline')
        ax.axvspan(5 if column == 0 else 17, 7 if column == 0 else 19, color='#dbeafe', alpha=.35)
        ax.set(title=f'{label} / {face}', xlabel='Scene time (hour)', ylabel='Linear illumination proxy (a.u.)', xlim=(start, end))
        ax.grid(alpha=.2)
axes[0, 0].legend(fontsize=8, loc='upper left')
fig.suptitle('Day/night transitions: combined-light model\nUnoccluded diffuse proxy; not lux or measured screen brightness', fontsize=14)
fig.savefig(root / 'lighting-curves.png', dpi=160)
