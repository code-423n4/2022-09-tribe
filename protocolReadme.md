# Fei Protocol ·

Smart contract code for Fei Protocol and the FEI stablecoin

## To get started:

1. Git clone this repo: git clone git@github.com:fei-protocol/fei-protocol-core.git
2. Install dependencies: `npm install && npm run setup:forge`
3. Set the relevant environment variables in a gitignored `.env`: `MAINNET_ALCHEMY_API_KEY` and `ETH_PRIVATE_KEY`. You can use the `.env.example` as a base
4. Build and compile contracts (both via hardhat *and* forge) and generate types: `npm run build`
5. Run forge tests: `npm run test:forge`, run hardhat tests: `npm run test:hardhat`, run forge integration/forked tests: `npm run test:integration` or `npm run test:integration:latest`, run hardhat integration/forked tests: `npm run test:e2e`

## Dependencies

Note that this has only been tested on Linux; you may encounter issues running on other operating systems.

- Node v16 (you can manage Node versions easily with [NVM](https://github.com/nvm-sh/nvm))

## Documentation

See the [docs](https://docs.fei.money)

## License

Fei Protocol is under [the AGPL v3 license](https://github.com/fei-protocol/fei-protocol-core/tree/7160dda163d45e6d6c7092ef021c365e0031a71f/LICENSE.md)
