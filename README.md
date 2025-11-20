# Speaker Box Calculator

A web-based speaker enclosure calculator with 3D visualization and DXF export capabilities.

## Features

- T/S parameter input and parsing via AI
- Sealed and ported enclosure calculations
- 3D visualization with rotation and zoom
- DXF export for CNC/laser cutting
- SQLite storage for saved calculations
- Golden ratio driver positioning

## Deploy to Vercel

1. Push this code to a GitHub repository
2. Connect your GitHub account to Vercel
3. Import the repository in Vercel dashboard
4. Deploy automatically

## Local Development

Open `index.html` in a web browser or run:
```bash
python -m http.server 3000
```

## Usage

1. Enter T/S parameters (Fs, Qts, Vas)
2. Select enclosure type (sealed/ported)
3. Click Calculate to get dimensions
4. View 3D visualization
5. Export DXF for cutting templates
