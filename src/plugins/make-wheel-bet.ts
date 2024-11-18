import { gql, makeExtendSchemaPlugin } from "@moneypot/caas/graphile";
import { GraphQLError } from "@moneypot/caas/graphql";
import { superuserPool, withPgPoolTransaction } from "@moneypot/caas/db";
import { maybeOneRow } from "@moneypot/caas/db/util";
import crypto from "crypto";

const Wheels: Record<string, Record<number, number[]>> = {
  LOW: {
    "10": [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
    "30": [
      1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 1.2, 0, 1.2,
      1.2, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0,
    ],
    "50": [
      1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 1.2, 0, 1.2,
      1.2, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0, 1.5, 1.2,
      1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2,
      1.2, 0,
    ],
  },
  MEDIUM: {
    "10": [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3],
    "30": [
      0, 2, 0, 1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0,
      2, 0, 2, 0, 1.7, 0, 4, 0, 1.5,
    ],
    "50": [
      0, 2, 0, 1.5, 0, 1.5, 0, 5, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0,
      1.5, 0, 3, 0, 1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 2,
      0, 2, 0, 1.5, 0, 3, 0, 1.5,
    ],
  },
  HIGH: {
    "10": [0, 0, 0, 0, 0, 0, 0, 0, 0, 9.9],
    "30": [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 9.9,
    ],
    "50": [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      49.5,
    ],
  },
};

export const MakeWheelBetPlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      enum Risk {
        LOW
        MEDIUM
        HIGH
      }

      input MakeWheelBetInput {
        wager: Float!
        currency: String!
        risk: Risk!
        segments: Int!
      }

      type MakeWheelBetPayload {
        multiplier: Float!
      }

      extend type Mutation {
        makeWheelBet(input: MakeWheelBetInput!): MakeWheelBetPayload
      }
    `,
    resolvers: {
      Mutation: {
        async makeWheelBet(_query, args, context) {
          const { session } = context;
          const { input } = args;

          if (!session) {
            throw new GraphQLError("Unauthorized");
          }

          if (!Wheels[input.risk]) {
            throw new GraphQLError("Invalid risk input");
          }

          const multipliers = Wheels[input.risk][input.segments];

          if (!multipliers) {
            throw new GraphQLError("Invalid segments input");
          }

          if (input.wager < 1) {
            throw new GraphQLError("Wager must be >= 1");
          }

          return withPgPoolTransaction(superuserPool, async (pgClient) => {
            // Ensure currency is found in casino currency list
            const dbCurrency = await pgClient
              .query<{ key: string }>({
                text: `
                  SELECT key
                  FROM caas.currency
                  WHERE key = $1 AND casino_id = $2
                `,
                values: [input.currency, session.casino_id],
              })
              .then(maybeOneRow);

            if (!dbCurrency) {
              throw new GraphQLError("Currency not found");
            }

            // Lock the user's balance row and ensure they can afford the wager
            const balance = await pgClient
              .query<{ amount: number }>({
                text: `
                  select amount from caas.balance
                  where user_id = $1
                    and casino_id = $2
                    and experience_id = $3
                    and currency_key = $4
                  for update
                `,
                values: [
                  session.user_id,
                  session.casino_id,
                  session.experience_id,
                  dbCurrency.key,
                ],
              })
              .then(maybeOneRow)
              .then((row) => row?.amount);

            console.log("balance", balance);
            if (!balance || balance < input.wager) {
              throw new GraphQLError("Insufficient funds for wager");
            }

            // Ensure the house can afford the potential payout
            // Lock the bankroll row
            const bankrollBalance = await pgClient
              .query<{ amount: number }>({
                text: `
                      select amount 
                      from caas.bankroll
                      where currency_key = $1 
                        and casino_id = $2 
                      for update
                    `,
                values: [dbCurrency.key, session.casino_id],
              })
              .then(maybeOneRow)
              .then((row) => row?.amount);

            // Ensure house can afford the max payout
            const maxMultiplier = Math.max(...multipliers);

            if (
              !bankrollBalance ||
              bankrollBalance < input.wager * maxMultiplier
            ) {
              throw new GraphQLError("House cannot afford payout");
            }

            // Roll a random number to determine the multiplier
            const randomIndex = crypto.randomInt(multipliers.length);
            const actualMultiplier = multipliers[randomIndex];

            const net = input.wager * actualMultiplier - input.wager;
            await pgClient.query({
              text: `
                UPDATE caas.balance
                SET amount = amount + $1 
                WHERE user_id = $2 
                  AND casino_id = $3
                  AND experience_id = $4 
                  AND currency_key = $5
              `,
              values: [
                net,
                session.user_id,
                session.casino_id,
                session.experience_id,
                dbCurrency.key,
              ],
            });

            await pgClient.query({
              text: `
                UPDATE caas.bankroll
                SET amount = amount - $1 
                WHERE currency_key = $2
                  AND casino_id = $3
              `,
              values: [net, dbCurrency.key, session.casino_id],
            });

            // Update bankroll stats
            await pgClient.query({
              text: `
                update caas.bankroll
                set bets = bets + 1,
                    wagered = wagered + $1
                where currency_key = $2
                  and casino_id = $3
              `,
              values: [input.wager, dbCurrency.key, session.casino_id],
            });

            return {
              multiplier: actualMultiplier,
            };
          });
        },
      },
    },
  };
});
