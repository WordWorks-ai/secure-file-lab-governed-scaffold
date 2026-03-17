package secure_file_lab

default allow = false

allow {
  input.action == "share.access"
  input.actor.type == "share_link"
  input.context.fileStatus == "active"
}

allow {
  input.actor.type == "user"
  input.actor.id != ""
  org_scope_ok
  allowed_user_action[input.action]
  ownership_ok
}

allowed_user_action["file.upload"]
allowed_user_action["file.activate"]
allowed_user_action["file.download"]
allowed_user_action["share.create"]
allowed_user_action["share.revoke"]

org_scope_ok {
  not input.resource.orgId
}

org_scope_ok {
  not input.context.actorOrgId
}

org_scope_ok {
  input.resource.orgId == input.context.actorOrgId
}

ownership_ok {
  input.actor.role == "admin"
}

ownership_ok {
  not input.resource.ownerUserId
}

ownership_ok {
  input.resource.ownerUserId == input.actor.id
}

ownership_ok {
  input.action == "share.revoke"
  input.context.shareCreatedByUserId == input.actor.id
}
