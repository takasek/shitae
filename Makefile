.PHONY: build test simulate-ecommerce simulate-battle simulate

build:
	pnpm --filter @shitae/simulator build
	pnpm --filter @shitae/cli build

test:
	pnpm -r test

# Usage: make simulate FILE=docs/examples/ecommerce.shitae
simulate: build
	node packages/cli/dist/index.js simulate $(FILE) > /tmp/shitae-sim.html
	open /tmp/shitae-sim.html

simulate-ecommerce: build
	node packages/cli/dist/index.js simulate docs/examples/ecommerce.shitae > /tmp/shitae-sim.html
	open /tmp/shitae-sim.html

simulate-battle: build
	node packages/cli/dist/index.js simulate docs/examples/battle.shitae > /tmp/shitae-sim.html
	open /tmp/shitae-sim.html
