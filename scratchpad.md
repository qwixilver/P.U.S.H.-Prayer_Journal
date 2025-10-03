Some notes on what I want to do:

### UI updates

1. I want the 'daily' view to group prayers not only by their category, but also by requestor. Categories should remain as large titles where they are right now, but requestor groupings should have smaller text denoting them, and should mostly be distinct because of the margin around the grouped container (likely <div>)

1. I want to be able to edit requestor and category data for prayers that have already been setup... When I click the 'edit' button for any prayer, it should present me with the same options as adding a new prayer - in fact, we can use the same modal, just make sure all the fields are populated with data from the original prayer. Of course when saving the updates, we need to ensure the events table is preserved along with the prayer even if category and/or requestor have changed.

1. The backup/restore panel was not ever restored to visibility while we were making changes and bugfixing for the events system. That's okay since I've been able to use the emergency restore panel we devised. However, I want the import panel to be restored and moved to a 'settings' page instead of on the categories page where it originally lived. I think that will make things a bit more intuitavie for the user.


### Feature updates

### Bugs

1. There seems to be some database corruption with the import I made from appsheet. One of my prayers shows David as the requestor and active contacts as the category even though this prayer was in the database long before that import happened and that category was available in the first place. I'm not sure this is actually too concerning, since it likely only affects me, but it's a bug all the same so I'm noting it.