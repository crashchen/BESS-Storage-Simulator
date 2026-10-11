# Contributing to BESS Storage Simulator

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/BESS-Storage-Simulator.git`
3. Activate Node 24.21.0 from `.nvmrc`, then install locked dependencies: `npm ci`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
# Start development server
npm run dev

# Run linting
npm run lint

# Run tests
npm test

# Build for production
npm run build
```

## Pull Request Process

1. Ensure lint, tests, type-check/build and the GitHub Pages sub-path build pass (`BASE_URL=/BESS-Storage-Simulator/ npm run build`)
2. Update documentation if needed
3. Create a pull request with a clear description of changes
4. Wait for CI checks to pass

For UI changes, also inspect the production build in a browser. jsdom does not
verify WebGL or responsive geometry. Record the viewport, renderer, input method
and limitations in a dated audit note; see [the evidence index](docs/README.md).
Local verification does not authorize merging or deploying. Keep mathematical
dispatch changes separate from presentation-only fixes when possible.

## Code Style

- Use TypeScript for all new code
- Follow existing code conventions
- Add JSDoc comments for public APIs
- Keep components focused and modular

## Reporting Issues

When reporting issues, please include:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment info

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
