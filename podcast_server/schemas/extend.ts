import { gql } from "@apollo/client";
import { mergeSchemas } from "@graphql-tools/schema";
import axios from "axios";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const API_KEY = process.env.GEMINI_API_KEY;
export const extendedGraphqlSchema = (schema: any) =>
  mergeSchemas({
    schemas: [schema],
    typeDefs: gql`
      type RegisterResponse {
        user: User
      }
      type PodcastRecommendation {
        id: ID!
        title: String!
        category: String!
        video_url: String
        artwork: String
        lyricist: String
        type: String!
        audio_url: String
        artist: ArtistInfo
        isFavourite: Boolean!
      }
      type ArtistInfo {
        id: ID!
        name: String!
        bio: String
        photo: String
      }

      extend type Mutation {
        registerUser(
          name: String!
          email: String!
          password: String!
        ): RegisterResponse
      }
      extend type Query {
        getRecommendedPodcasts(userId: ID!): [PodcastRecommendation]
      }
    `,
    resolvers: {
      Mutation: {
        registerUser: async (root, { name, email, password }, context) => {
          const existingUser = await context.db.User.findOne({
            where: { email },
          });
          if (existingUser) {
            throw new Error("User already exists with this email.");
          }

          const newUser = await context.db.User.createOne({
            data: { name, email, password },
          });
          return { user: newUser };
        },
      },
      Query: {
        getRecommendedPodcasts: async (_, { userId }, context) => {
          try {
            const user = await context.db.User.findOne({
              where: { id: userId },
              query: "id favoritePodcasts {id title category",
            });

            if (!user) {
              throw new Error("User not found");
            }

            const favoritePodcasts = user.favoritePodcasts || [];
            const favoriteCategories = [
              ...new Set(favoritePodcasts.map((p) => p.category)),
            ];

            const allPodcasts = await context.db.Podcast.findMany({
              query: `
                id
                title
                category
                video_url
                artwork
                lyricist
                type
                audio_url
                artist {
                    id
                    name
                    bio
                    photo
                }
                `,
            });

            const favoritePodcastIds = favoritePodcasts.map((p: any) => p.id);
            const availablePodcasts = allPodcasts.filter(
              () => !favoritePodcastIds.includes(p.id)
            );

            if (availablePodcasts.length === 0) {
              return [];
            }

            const prompt = `
                You are an AI podcast recommendatation system.
                The user has listened to these categories: ${
                  favoriteCategories?.length
                    ? favoriteCategories?.join(", ")
                    : "None"
                }.

                From the following available podcasts, suggest 3 that match their interests:
                ${
                  availablePodcasts?.length
                    ? availablePodcasts
                        .map(
                          (p: any) =>
                            `${p.title} (Category: ${p?.category}, Artist: ${p?.artist?.name})`
                        )
                        .join("\n")
                    : "No podcast availablePodcasts"
                }

                Return only the titles in this JSON format: 
                {
                    "recommendatations" : ["Title 1", "Title 2", "Title 3"]
                }
            `;

            const response = await axios.post(
              `${GEMINI_API_URL}?key=${process.env.API_KEY}`,
              {
                contents: [
                  {
                    parts: [{ text: prompt }],
                  },
                ],
              },
              {
                headers: { "Content-Type": "application/json" },
              }
            );
            const aiResponse =
              response.data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

            const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
            console.log(jsonMatch);

            if (!jsonMatch) {
              throw new Error("AI response does not contain JSON");
            }
            const jsonString = jsonMatch[1];
            const { recommendatations } = JSON.parse(jsonString);

            if (!Array.isArray(recommendatations)) {
              throw new Error("Invalid AI response format");
            }

            const matchedPodcasts = allPodcasts.filter((p: any) =>
              recommendatations.includes(p.title)
            );

            const podcastsWithArtist = matchedPodcasts?.map((podcast: any) => {
              return {
                ...podcast,
                artist: {
                  bio: "",
                  id: 124,
                  name: "AI Generator",
                  photo: "",
                },
              };
            });
          } catch (error) {
            console.log("Error in AI Podcast Recommendation", error);
            throw new Error("Failed to get recommendatations");
          }
        },
      },
    },
  });
