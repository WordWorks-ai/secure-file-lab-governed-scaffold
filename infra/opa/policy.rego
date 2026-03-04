package schwass

default allow = false

allow {
  input.action == "share.access"
  input.actor.type == "share_link"
}

allow {
  input.actor.type == "user"
  input.actor.id != ""
  allowed_user_action[input.action]
}

allowed_user_action["file.upload"]
allowed_user_action["file.activate"]
allowed_user_action["file.download"]
allowed_user_action["share.create"]
allowed_user_action["share.revoke"]
