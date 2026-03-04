require 'net/http'
require 'json'
require 'uri'

# ===================== StockSense RSpec Helper =====================
# Shared HTTP utilities for all specs

BASE_URL = 'http://localhost:3000'

# Make an HTTP request and return { status:, body:, cookies: }
def api_request(method, path, body: nil, cookies: nil)
  uri = URI("#{BASE_URL}#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.read_timeout = 10
  http.open_timeout = 5

  request = case method.upcase
  when 'GET'    then Net::HTTP::Get.new(uri)
  when 'POST'   then Net::HTTP::Post.new(uri)
  when 'PUT'    then Net::HTTP::Put.new(uri)
  when 'DELETE' then Net::HTTP::Delete.new(uri)
  end

  request['Content-Type'] = 'application/json'
  request['Cookie'] = cookies if cookies
  request.body = body.to_json if body

  begin
    response = http.request(request)
    parsed = JSON.parse(response.body) rescue {}
    set_cookies = response.get_fields('set-cookie') || []
    {
      status: response.code.to_i,
      json:   parsed,
      cookies: set_cookies.join('; ')
    }
  rescue => e
    { status: 0, json: {}, cookies: '' }
  end
end

RSpec.configure do |config|
  config.color = true
  config.formatter = :documentation

  # Shared admin/staff session cookies (set once before all tests)
  config.before(:suite) do
    puts "\n  Connecting to StockSense at #{BASE_URL}..."
    r = api_request('GET', '/api/session')
    if r[:status] == 0
      abort "\n  ERROR: Server is not running. Start it first:\n  cd \"backend files\" && node server.js\n"
    end
    puts "  Server is up. Running tests...\n\n"
  end
end
