/* Edit this file to publish stories. Each article: category (News, Business, Sports, Opinion),
   title, summary, author, time, views (for "Most read"), optional image URL and link. */
const SITE_DATA = {
  breaking: [
    "Replace this line with your latest breaking headline",
    "Add up to five headlines here and they rotate automatically"
  ],
  articles: [
    { category: "News", title: "Your lead story headline goes here and can run across two lines", summary: "A one or two sentence summary tells readers why this story matters to them.", author: "Newsroom", time: "10 min ago", views: 980 },
    { category: "News", title: "Second top story headline sits in the side column", summary: "Short summary text.", author: "Newsroom", time: "35 min ago", views: 760 },
    { category: "Business", title: "Third top story headline for the business desk", summary: "Short summary text.", author: "Business Desk", time: "1 hr ago", views: 640 },
    { category: "News", title: "County news headline example for readers in the regions", summary: "Short summary text.", author: "Newsroom", time: "2 hrs ago", views: 520 },
    { category: "News", title: "Another news headline placeholder to fill the grid", summary: "Short summary text.", author: "Newsroom", time: "3 hrs ago", views: 410 },
    { category: "Business", title: "Markets and money headline placeholder", summary: "Short summary text.", author: "Business Desk", time: "4 hrs ago", views: 450 },
    { category: "Business", title: "Small business story headline placeholder", summary: "Short summary text.", author: "Business Desk", time: "5 hrs ago", views: 330 },
    { category: "Sports", title: "Match report headline placeholder for football fans", summary: "Short summary text.", author: "Sports Desk", time: "1 hr ago", views: 700 },
    { category: "Sports", title: "Athletics headline placeholder from the track", summary: "Short summary text.", author: "Sports Desk", time: "6 hrs ago", views: 390 },
    { category: "Opinion", title: "Opinion column headline placeholder with a clear point of view", summary: "Short summary text.", author: "Guest Columnist", time: "Today", views: 300 },
    { category: "Opinion", title: "Editorial headline placeholder from the editor's desk", summary: "Short summary text.", author: "Editorial Board", time: "Today", views: 280 }
  ],
  /* youtubeId is the part after v= in a YouTube link. Leave empty until you have a video. */
  videos: [
    { title: "Evening news bulletin", length: "24:10", youtubeId: "" },
    { title: "Interview of the week", length: "18:45", youtubeId: "" },
    { title: "Sports highlights", length: "09:30", youtubeId: "" },
    { title: "Business briefing", length: "12:05", youtubeId: "" }
  ]
};
