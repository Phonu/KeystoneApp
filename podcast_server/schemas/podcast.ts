import { list, graphql } from "@keystone-6/core";
import { relationship, select, text, virtual } from "@keystone-6/core/fields";
export const Podcast = list({
  access: {
    operation: {
      query: () => true,
      create: () => true,
      update: ({ session }) => !!session,
      delete: ({ session }) => !!session,
    },
  },
  fields: {
    title: text({ validation: { isRequired: true } }),
    audio_url: text(),
    video_url: text(),
    artwork: text(),
    lyricist: text(),
    category: text(),
    type: select({
      options: [
        { label: "Audio", value: "audio" },
        { label: "Video", value: "video" },
      ],
      defaultValue: "audio",
      validation: { isRequired: true },
    }),
    artist: relationship({ ref: "Artist" }),
    // favoritedBy: relationship({ ref: "User.favoritePodcasts", many: true }),
    favoritedCount: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve: async (item, args, context) => {
          const count = await context.db.User.count({
            where: { favoritePodcasts: { smome: { id: { equals: item.id } } } },
          });
          return count;
        },
      }),
    }),
  },
});
