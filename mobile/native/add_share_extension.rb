# Adds DeVig to the iPhone share sheet (run by .github/workflows/devig_apps.yml after add_live_activity.rb, from mobile/): a
# share extension "DeVigShare" that hands what was shared to the app as devig://open?text=... The files are copied into
# ios/App/DeVigShare before this runs.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort('no App target')
app_conf = app.build_configurations.first.build_settings

ext = project.new_target(:app_extension, 'DeVigShare', :ios, '15.0', nil, :swift)
group = project.main_group.new_group('DeVigShare', 'DeVigShare')
ext.source_build_phase.add_file_reference(group.new_reference('ShareViewController.swift'), true)
group.new_reference('Info.plist')

ext.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'dev.pages.devigai.app.share'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'DeVigShare/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['MARKETING_VERSION'] = app_conf['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_conf['CURRENT_PROJECT_VERSION'] || '1'
  s['CODE_SIGNING_ALLOWED'] = 'NO'
  s['CODE_SIGN_STYLE'] = 'Manual'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
end

app.add_dependency(ext)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions').tap { |p| p.symbol_dst_subfolder_spec = :plug_ins }
bf = embed.add_file_reference(ext.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeaderFiles'] }

project.save
puts 'Added the DeVigShare share extension'
