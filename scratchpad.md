Some notes on what I want to do:

### UI updates

1. I want the 'daily' view to be segmented into it's respective categories. These categories should not be editable, but just denote which category the prayer entries are to be found in so that when there are lots of prayers, and/or categories, it's easier to follow. 

1. I want to make the app more consistent by adding a floating action button (FAB) on the categories page to add new categories, just the way we did with the add new requestors button on the daily page


### Feature updates

1. I want an 'event' log system with the requests. Each request should be able to add an event from either the single view, or the expanded view on the daily tab This event log will allow users to record events as they happen regarding requests. This allows events to be listed in chronological order in the prayer request so that we have a timeline as the requests are being answered that will help us look back to see how God moved in particular situations...

1. I want the import panel to be moved to a 'settings' page. I may want to expirement with where the settings page lives in the interface though. It might live in a side drawer, or it might live in a new tab along the bottom nav

1. I want a new functional space for 'personal journaling' This will function much more like an actual journal where entries are more freeform, but the idea is that it will focus on your personal walk with God and your personal prayer life.


### Bugs

1. There seems to be some database corruption with the import I made from appsheet. One of my prayers shows David as the requestor and active contacts as the category even though this prayer was in the database long before that import happened and that category was available in the first place. I'm not sure this is actually too concerning, since it likely only affects me, but it's a bug all the same so I'm noting it.